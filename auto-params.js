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

// Inicializar extensión
tableau.extensions.initializeAsync({ configure: configure }).then(
  () => {
    startTime = Date.now()
    addLog("Extensión inicializada correctamente", "success")

    // Cargar configuración guardada
    loadConfiguration()

    // Ejecutar carga automática de parámetros
    autoLoadParameters()
  },
  (error) => {
    showError("Error al inicializar extensión: " + error.toString())
  },
)

// Función principal: cargar parámetros automáticamente
async function autoLoadParameters() {
  try {
    updateStatus("loading", "Obteniendo datos...", "Esto puede tardar unos segundos")

    // 1. Obtener username del usuario actual
    const username = tableau.extensions.environment.username
    addLog(`Usuario detectado: ${username}`, "success")
    document.getElementById("username").textContent = username

    // 2. Verificar que existe configuración
    if (!CONFIG.dataSourceName || CONFIG.parameterMappings.length === 0) {
      addLog("No hay configuración. Mostrando botón de configuración...", "warning")
      showConfigureButton()
      return
    }

    // 3. Obtener la fuente de datos configurada
    const dataSource = await getDataSource(CONFIG.dataSourceName)
    if (!dataSource) {
      throw new Error(`No se encontró la fuente de datos: ${CONFIG.dataSourceName}`)
    }
    addLog(`Fuente de datos encontrada: ${CONFIG.dataSourceName}`, "success")

    // 4. Aplicar filtro por username (esto reduce la carga a 1 registro)
    addLog(`Filtrando por usuario: ${username}...`, "info")
    const userData = await getFilteredUserData(dataSource, username)

    if (!userData || userData.length === 0) {
      throw new Error(`No se encontraron datos para el usuario: ${username}`)
    }
    addLog(`Datos del usuario obtenidos (${userData.length} registro)`, "success")

    // 5. Alimentar parámetros con los datos del usuario
    const paramsLoaded = await feedParameters(userData[0])

    // 6. Mostrar éxito
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2)
    updateStatus("success", "✓ Parámetros Cargados", `${paramsLoaded} parámetros alimentados correctamente`)
    document.getElementById("paramsCount").textContent = paramsLoaded
    document.getElementById("loadTime").textContent = `${loadTime}s`
    infoBox.style.display = "block"

    addLog(`✓ Proceso completado en ${loadTime}s`, "success")
  } catch (error) {
    showError("Error al cargar parámetros: " + error.message)
  }
}

// Obtener fuente de datos por nombre
async function getDataSource(dataSourceName) {
  const dashboard = tableau.extensions.dashboardContent.dashboard
  const dataSources = await dashboard.worksheets[0].getDataSourcesAsync()

  return dataSources.find((ds) => ds.name === dataSourceName)
}

// Obtener datos filtrados del usuario (solo 1 registro)
async function getFilteredUserData(dataSource, username) {
  try {
    // Obtener la tabla lógica
    const logicalTables = await dataSource.getLogicalTablesAsync()
    const logicalTable = logicalTables[0]

    addLog("Obteniendo datos (máximo 1 registro)...", "info")

    // Obtener datos con límite de 1 registro
    const dataTable = await logicalTable.getDataAsync({
      maxRows: 1,
      ignoreSelection: true,
      includeAllColumns: true,
    })

    // Buscar el índice de la columna de username
    const usernameColumnIndex = dataTable.columns.findIndex(
      (col) => col.fieldName.toLowerCase() === CONFIG.usernameColumn.toLowerCase(),
    )

    if (usernameColumnIndex === -1) {
      throw new Error(`No se encontró la columna: ${CONFIG.usernameColumn}`)
    }

    // Filtrar por username (ya deberías tener solo 1 registro si el filtro está bien configurado en Tableau)
    const userData = dataTable.data.filter((row) => row[usernameColumnIndex].value === username)

    return userData
  } catch (error) {
    addLog("Error al obtener datos: " + error.message, "error")
    throw error
  }
}

// Alimentar parámetros con los datos del usuario
async function feedParameters(userDataRow) {
  const dashboard = tableau.extensions.dashboardContent.dashboard
  const parameters = await dashboard.getParametersAsync()

  let paramsLoaded = 0

  for (const mapping of CONFIG.parameterMappings) {
    try {
      // Encontrar el parámetro
      const parameter = parameters.find((p) => p.name === mapping.parameterName)
      if (!parameter) {
        addLog(`⚠ Parámetro no encontrado: ${mapping.parameterName}`, "warning")
        continue
      }

      // Encontrar el índice de la columna
      const columnIndex = userDataRow.findIndex((cell, index) => {
        const dataSource = tableau.extensions.dashboardContent.dashboard.worksheets[0]
        // Esta es una simplificación, necesitarás ajustar según tu estructura
        return mapping.columnName === cell.fieldName
      })

      // Obtener el valor de la columna
      const value = userDataRow[mapping.columnIndex].value

      // Cambiar el valor del parámetro
      await parameter.changeValueAsync(value)
      addLog(`✓ Parámetro "${mapping.parameterName}" = "${value}"`, "success")
      paramsLoaded++
    } catch (error) {
      addLog(`✗ Error en parámetro "${mapping.parameterName}": ${error.message}`, "error")
    }
  }

  return paramsLoaded
}

// Configuración de la extensión
function configure() {
  const popupUrl = window.location.href.replace("index.html", "config.html")

  tableau.extensions.ui
    .displayDialogAsync(popupUrl, "", {
      height: 500,
      width: 600,
    })
    .then((closePayload) => {
      // Recargar configuración y ejecutar de nuevo
      loadConfiguration()
      autoLoadParameters()
    })
    .catch((error) => {
      addLog("Configuración cancelada", "warning")
    })
}

// Cargar configuración guardada
function loadConfiguration() {
  const settings = tableau.extensions.settings.getAll()

  if (settings.dataSourceName) {
    CONFIG.dataSourceName = settings.dataSourceName
    CONFIG.usernameColumn = settings.usernameColumn || "username"
    CONFIG.parameterMappings = JSON.parse(settings.parameterMappings || "[]")

    addLog("Configuración cargada desde settings", "success")
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
