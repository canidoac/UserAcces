// Importar la variable tableau
const tableau = window.tableau

// Configuración de la extensión
const CONFIG = {
  dataSourceName: null, // Nombre de la fuente de datos (se configura después)
  usernameColumn: "username", // Columna que contiene el username
  parameterMappings: [], // Mapeo de columnas a parámetros
}

// Variables de estado
let startTime
const logEntries = []

// Elementos del DOM
const statusIcon = document.getElementById("statusIcon")
const statusTitle = document.getElementById("statusTitle")
const statusSubtitle = document.getElementById("statusSubtitle")
const infoBox = document.getElementById("infoBox")
const configureBtn = document.getElementById("configureBtn")
const logContainer = document.getElementById("logContainer")

// Verificar que tableau esté disponible
if (typeof tableau === "undefined") {
  console.error("[v0] ERROR: La API de Tableau no está cargada")
  document.getElementById("statusTitle").textContent = "Error de API"
  document.getElementById("statusSubtitle").textContent = "La API de Tableau no se cargó correctamente"
  throw new Error("Tableau API no disponible")
}

// Inicializar extensión
console.log("[v0] Iniciando inicialización de extensión...")
tableau.extensions.initializeAsync().then(
  () => {
    startTime = Date.now()
    console.log("[v0] Extensión inicializada correctamente")
    addLog("Extensión inicializada correctamente", "success")

    // Siempre habilitar el botón de configuración desde el inicio
    configureBtn.style.display = "block"
    configureBtn.onclick = configure

    try {
      // Cargar configuración guardada
      const hasConfig = loadConfiguration()

      console.log("[v0] ¿Tiene configuración?", hasConfig)

      // Si no hay configuración, mostrar mensaje
      if (!hasConfig) {
        console.log("[v0] No hay configuración, esperando configuración del usuario")
        showConfigureButton()
        return
      }

      // Si hay configuración, ejecutar carga automática
      console.log("[v0] Configuración encontrada, iniciando carga automática")
      autoLoadParameters().catch((error) => {
        console.error("[v0] Error no capturado:", error)
        showError("Error inesperado: " + error.message)
      })
    } catch (error) {
      console.error("[v0] Error en proceso de inicialización:", error)
      showError("Error al procesar configuración: " + error.message)
    }
  },
  (error) => {
    console.error("[v0] Error al inicializar:", error)
    showError("Error al inicializar extensión: " + error.toString())
  },
)

// Función principal: cargar parámetros automáticamente
async function autoLoadParameters() {
  try {
    console.log("[v0] Iniciando autoLoadParameters")
    updateStatus("loading", "Obteniendo datos...", "Esto puede tardar unos segundos")

    // 1. Obtener username del usuario actual
    console.log("[v0] Obteniendo username...")
    const username = tableau.extensions.environment.username || "Usuario Desconocido"
    console.log("[v0] Username obtenido:", username)
    addLog(`Usuario detectado: ${username}`, "success")
    document.getElementById("username").textContent = username

    // 2. Verificar que existe configuración
    console.log("[v0] Verificando configuración...")
    console.log("[v0] CONFIG:", CONFIG)

    if (!CONFIG.dataSourceName || CONFIG.parameterMappings.length === 0) {
      console.log("[v0] No hay configuración, mostrando botón")
      addLog("No hay configuración. Mostrando botón de configuración...", "warning")
      showConfigureButton()
      return
    }

    // 3. Obtener la fuente de datos configurada
    console.log("[v0] Buscando fuente de datos:", CONFIG.dataSourceName)
    const dataSource = await getDataSource(CONFIG.dataSourceName)

    if (!dataSource) {
      throw new Error(`No se encontró la fuente de datos: ${CONFIG.dataSourceName}`)
    }
    addLog(`Fuente de datos encontrada: ${CONFIG.dataSourceName}`, "success")

    // 4. Obtener datos del usuario
    console.log("[v0] Obteniendo datos del usuario...")
    addLog(`Filtrando por usuario: ${username}...`, "info")
    const userData = await getFilteredUserData(dataSource, username)

    if (!userData || userData.length === 0) {
      throw new Error(`No se encontraron datos para el usuario: ${username}`)
    }
    addLog(`Datos del usuario obtenidos (${userData.length} registro)`, "success")

    // 5. Alimentar parámetros con los datos del usuario
    console.log("[v0] Alimentando parámetros...")
    const paramsLoaded = await feedParameters(userData[0], dataSource)

    // 6. Mostrar éxito
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2)
    updateStatus("success", "✓ Parámetros Cargados", `${paramsLoaded} parámetros alimentados correctamente`)
    document.getElementById("paramsCount").textContent = paramsLoaded
    document.getElementById("loadTime").textContent = `${loadTime}s`
    infoBox.style.display = "block"

    addLog(`✓ Proceso completado en ${loadTime}s`, "success")
  } catch (error) {
    console.error("[v0] Error en autoLoadParameters:", error)
    showError("Error al cargar parámetros: " + error.message)
  }
}

async function getDataSource(dataSourceName) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    console.log("[v0] Dashboard obtenido, worksheets:", dashboard.worksheets.length)

    // Buscar en todos los worksheets
    for (const worksheet of dashboard.worksheets) {
      console.log("[v0] Buscando en worksheet:", worksheet.name)
      const dataSources = await worksheet.getDataSourcesAsync()
      console.log(
        "[v0] Fuentes de datos encontradas:",
        dataSources.map((ds) => ds.name),
      )

      const found = dataSources.find((ds) => ds.name === dataSourceName)
      if (found) {
        console.log("[v0] Fuente de datos encontrada!")
        return found
      }
    }

    console.log("[v0] Fuente de datos no encontrada")
    return null
  } catch (error) {
    console.error("[v0] Error en getDataSource:", error)
    throw error
  }
}

async function getFilteredUserData(dataSource, username) {
  try {
    console.log("[v0] Obteniendo tablas lógicas...")
    const logicalTables = await dataSource.getLogicalTablesAsync()
    console.log("[v0] Tablas lógicas:", logicalTables.length)

    if (logicalTables.length === 0) {
      throw new Error("No se encontraron tablas en la fuente de datos")
    }

    const logicalTable = logicalTables[0]
    console.log("[v0] Usando tabla:", logicalTable.id)

    addLog("Obteniendo datos (máximo 100 registros)...", "info")

    const dataTable = await logicalTable.getDataAsync({
      maxRows: 100,
      ignoreSelection: true,
      includeAllColumns: true,
    })

    console.log("[v0] Datos obtenidos, filas:", dataTable.data.length)
    console.log(
      "[v0] Columnas:",
      dataTable.columns.map((c) => c.fieldName),
    )

    // Buscar el índice de la columna de username
    const usernameColumnIndex = dataTable.columns.findIndex(
      (col) => col.fieldName.toLowerCase() === CONFIG.usernameColumn.toLowerCase(),
    )

    console.log("[v0] Índice columna username:", usernameColumnIndex)

    if (usernameColumnIndex === -1) {
      throw new Error(`No se encontró la columna: ${CONFIG.usernameColumn}`)
    }

    // Filtrar por username
    const userData = dataTable.data.filter((row) => {
      const cellValue = row[usernameColumnIndex].value
      console.log("[v0] Comparando:", cellValue, "con", username)
      return cellValue === username
    })

    console.log("[v0] Registros filtrados:", userData.length)
    return userData
  } catch (error) {
    console.error("[v0] Error al obtener datos:", error)
    addLog("Error al obtener datos: " + error.message, "error")
    throw error
  }
}

async function feedParameters(userDataRow, dataSource) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    const parameters = await dashboard.getParametersAsync()

    console.log(
      "[v0] Parámetros disponibles:",
      parameters.map((p) => p.name),
    )
    console.log("[v0] Mapeos configurados:", CONFIG.parameterMappings)

    // Obtener nombres de columnas
    const logicalTables = await dataSource.getLogicalTablesAsync()
    const dataTable = await logicalTables[0].getDataAsync({ maxRows: 1 })
    const columnNames = dataTable.columns.map((c) => c.fieldName)

    console.log("[v0] Columnas disponibles:", columnNames)

    let paramsLoaded = 0

    for (const mapping of CONFIG.parameterMappings) {
      try {
        console.log("[v0] Procesando mapeo:", mapping)

        // Encontrar el parámetro
        const parameter = parameters.find((p) => p.name === mapping.parameterName)
        if (!parameter) {
          addLog(`⚠ Parámetro no encontrado: ${mapping.parameterName}`, "warning")
          continue
        }

        // Encontrar el índice de la columna
        const columnIndex = columnNames.findIndex((name) => name.toLowerCase() === mapping.columnName.toLowerCase())

        console.log("[v0] Índice de columna:", columnIndex)

        if (columnIndex === -1) {
          addLog(`⚠ Columna no encontrada: ${mapping.columnName}`, "warning")
          continue
        }

        // Obtener el valor de la columna
        const value = userDataRow[columnIndex].value
        console.log("[v0] Valor obtenido:", value)

        // Cambiar el valor del parámetro
        await parameter.changeValueAsync(String(value))
        addLog(`✓ Parámetro "${mapping.parameterName}" = "${value}"`, "success")
        paramsLoaded++
      } catch (error) {
        console.error("[v0] Error en parámetro:", error)
        addLog(`✗ Error en parámetro "${mapping.parameterName}": ${error.message}`, "error")
      }
    }

    return paramsLoaded
  } catch (error) {
    console.error("[v0] Error en feedParameters:", error)
    throw error
  }
}

// Configuración de la extensión
function configure() {
  console.log("[v0] Abriendo diálogo de configuración...")
  const popupUrl = window.location.href.replace("index.html", "config.html")
  console.log("[v0] URL de configuración:", popupUrl)

  addLog("Abriendo ventana de configuración...", "info")

  tableau.extensions.ui
    .displayDialogAsync(popupUrl, "", {
      height: 600,
      width: 700,
    })
    .then((closePayload) => {
      console.log("[v0] Configuración guardada, recargando...")
      addLog("Configuración guardada exitosamente", "success")
      // Recargar configuración y ejecutar de nuevo
      setTimeout(() => {
        window.location.reload()
      }, 500)
    })
    .catch((error) => {
      // Esto es normal si el usuario cierra la ventana
      if (error.toString().includes("canceled")) {
        console.log("[v0] Usuario canceló la configuración")
        addLog("Configuración cancelada por el usuario", "warning")
      } else {
        console.error("[v0] Error en configuración:", error)
        addLog("Error al abrir configuración: " + error.message, "error")
      }
    })
}

// Cargar configuración guardada
function loadConfiguration() {
  try {
    console.log("[v0] Cargando configuración...")
    const settings = tableau.extensions.settings.getAll()
    console.log("[v0] Settings:", settings)

    if (settings.dataSourceName) {
      CONFIG.dataSourceName = settings.dataSourceName
      CONFIG.usernameColumn = settings.usernameColumn || "username"
      CONFIG.parameterMappings = JSON.parse(settings.parameterMappings || "[]")

      console.log("[v0] Configuración cargada:", CONFIG)
      addLog("Configuración cargada desde settings", "success")
      return true
    } else {
      console.log("[v0] No hay configuración guardada")
      return false
    }
  } catch (error) {
    console.error("[v0] Error cargando configuración:", error)
    return false
  }
}

// Mostrar botón de configuración
function showConfigureButton() {
  updateStatus("warning", "Configuración Requerida", "Debes configurar la fuente de datos y mapeo de parámetros")
  configureBtn.style.display = "block"
  configureBtn.onclick = configure
}

// Actualizar estado visual
function updateStatus(type, title, subtitle) {
  const icons = {
    loading: "⏳",
    success: "✓",
    error: "✗",
    warning: "⚠️",
  }

  statusIcon.className = `status-icon ${type}`
  statusIcon.textContent = icons[type]
  statusTitle.textContent = title
  statusSubtitle.textContent = subtitle
}

// Mostrar error
function showError(message) {
  console.error("[v0]", message)
  updateStatus("error", "Error", message)
  addLog(`✗ ${message}`, "error")

  configureBtn.style.display = "block"
  configureBtn.onclick = configure
}

// Agregar entrada al log
function addLog(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString("es-ES")
  const logEntry = document.createElement("div")
  logEntry.className = `log-entry ${type}`
  logEntry.textContent = `[${timestamp}] ${message}`

  logContainer.appendChild(logEntry)
  logContainer.scrollTop = logContainer.scrollHeight

  console.log("[v0]", message)
}
