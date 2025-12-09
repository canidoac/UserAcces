// Importar la variable tableau
const tableau = window.tableau

// MODO TESTING: Cambia esto a true para probar con un usuario específico
const TESTING_MODE = false
const TEST_EMAIL = "andres.canido@mercadolibre.com"
// </CHANGE>

// Configuración de la extensión
const CONFIG = {
  dataSourceName: null, // Nombre de la fuente de datos (se configura después)
  usernameColumn: "EMAIL", // Columna que contiene el username
  parameterMappings: [], // Mapeo de columnas a parámetros
  hideAfterLoad: false,
  errorMessage: "",
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
  console.error("[v1] ERROR: La API de Tableau no está cargada")
  document.getElementById("statusTitle").textContent = "Error de API"
  document.getElementById("statusSubtitle").textContent = "La API de Tableau no se cargó correctamente"
  throw new Error("Tableau API no disponible")
}

// Inicializar extensión
console.log("[v1] Iniciando inicialización de extensión...")

tableau.extensions.initializeAsync().then(
  () => {
    startTime = Date.now()
    console.log("[v1] Extensión inicializada correctamente")
    addLog("Extensión inicializada correctamente", "success")

    // Siempre habilitar el botón de configuración desde el inicio
    configureBtn.style.display = "block"
    configureBtn.onclick = configure

    try {
      // Cargar configuración guardada
      const hasConfig = loadConfiguration()

      console.log("[v1] ¿Tiene configuración?", hasConfig)

      // Si no hay configuración, mostrar mensaje
      if (!hasConfig) {
        console.log("[v1] No hay configuración, esperando configuración del usuario")
        showConfigureButton()
        return
      }

      // Si hay configuración, ejecutar carga automática
      console.log("[v1] Configuración encontrada, iniciando carga automática")
      autoLoadParameters().catch((error) => {
        console.error("[v1] Error no capturado:", error)
        showError("Error inesperado: " + error.message)
      })
    } catch (error) {
      console.error("[v1] Error en proceso de inicialización:", error)
      showError("Error al procesar configuración: " + error.message)
    }
  },
  (error) => {
    console.error("[v1] Error al inicializar:", error)
    showError("Error al inicializar extensión: " + error.toString())
  },
)

// ============================
// Función principal (auto load)
// ============================
async function autoLoadParameters() {
  try {
    console.log("[v0] Iniciando autoLoadParameters")
    updateStatus("loading", "Paso 1/5: Iniciando...", "Cargando extensión")

    // Verificar que existe configuración
    console.log("[v0] Verificando configuración...")
    updateStatus("loading", "Paso 2/5: Verificando configuración...", "Cargando settings guardados")
    console.log("[v0] CONFIG:", CONFIG)

    if (!CONFIG.dataSourceName || CONFIG.parameterMappings.length === 0) {
      console.log("[v0] No hay configuración, mostrando botón")
      addLog("No hay configuración. Debes configurar la fuente de datos y mapeos de parámetros.", "warning")
      showConfigureButton()
      return
    }

    // Obtener la fuente de datos configurada
    console.log("[v0] Buscando fuente de datos:", CONFIG.dataSourceName)
    updateStatus("loading", "Paso 3/5: Buscando fuente de datos...", `Conectando a: ${CONFIG.dataSourceName}`)
    const dataSource = await getDataSource(CONFIG.dataSourceName)

    if (!dataSource) {
      addLog(`Fuente de datos no encontrada: ${CONFIG.dataSourceName}`, "error")
      showError(`No se encontró la fuente de datos: ${CONFIG.dataSourceName}`)
      return
    }

    addLog(`Fuente de datos encontrada: ${dataSource.name}`, "success")

    console.log("[v0] Obteniendo datos ya filtrados por Tableau...")
    updateStatus("loading", "Paso 4/5: Leyendo tus datos...", "El worksheet ya está filtrado por USERNAME()")

    const userData = await getFilteredUserData(dataSource)

    if (!userData) {
      showError("No se encontraron datos para tu usuario. Verifica que el filtro USERNAME() esté aplicado en 'Hoja 1'")
      return
    }

    addLog(`Datos obtenidos correctamente`, "success")

    // Alimentar los parámetros
    console.log("[v0] Alimentando parámetros...")
    updateStatus("loading", "Paso 5/5: Alimentando parámetros...", "Configurando tus valores personalizados")

    const feedResults = await feedParameters(userData)

    const firstMapping = CONFIG.parameterMappings[0]
    const firstParamValue = userData[firstMapping.columnName]

    console.log("[v0] Valor del parámetro principal:", firstParamValue)

    if (!firstParamValue || firstParamValue.toString().toUpperCase() === "NO_ROLE") {
      // Usuario sin rol válido, mostrar mensaje de error personalizado
      const errorMsg = CONFIG.errorMessage || "No tienes un rol asignado. Contacta con soporte para obtener acceso."
      console.log("[v0] Usuario con NO_ROLE, mostrando error")
      showError(errorMsg)
      return
    }

    // Mostrar éxito
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2)

    const paramsList = CONFIG.parameterMappings
      .map((m) => `${m.parameterName}: ${userData[m.columnName] || "N/A"}`)
      .join(", ")

    showSuccess(`Parámetros cargados en ${elapsedTime}s`, `Tus configuraciones: ${paramsList}`, firstParamValue)
  } catch (error) {
    console.error("[v0] Error en autoLoadParameters:", error)
    const errorMsg = CONFIG.errorMessage || `Error al cargar parámetros: ${error.message}`
    showError(errorMsg)
  }
}

// ========================
// Obtener fuente de datos
// ========================
async function getDataSource(dataSourceName) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    console.log("[v1] Dashboard obtenido, worksheets:", dashboard.worksheets.length)

    // Buscar en todos los worksheets
    for (const worksheet of dashboard.worksheets) {
      console.log("[v1] Buscando en worksheet:", worksheet.name)
      const dataSources = await worksheet.getDataSourcesAsync()
      console.log(
        "[v1] Fuentes de datos encontradas:",
        dataSources.map((ds) => ds.name),
      )

      const found = dataSources.find((ds) => ds.name === dataSourceName)
      if (found) {
        console.log("[v1] Fuente de datos encontrada!")
        return found
      }
    }

    console.log("[v1] Fuente de datos no encontrada")
    return null
  } catch (error) {
    console.error("[v1] Error en getDataSource:", error)
    throw error
  }
}

// ============================
// Obtener datos ya filtrados
// ============================
async function getFilteredUserData(dataSource) {
  try {
    console.log("[v0] Obteniendo datos de la fuente...")
    addLog("Obteniendo datos de la fuente...", "info")

    if (TESTING_MODE) {
      console.log("[v0] MODO TESTING ACTIVADO - Buscando email:", TEST_EMAIL)
      addLog(`MODO TESTING: Buscando usuario ${TEST_EMAIL}`, "warning")
    }

    const dashboard = tableau.extensions.dashboardContent.dashboard
    const worksheets = dashboard.worksheets

    let worksheet = null
    for (const ws of worksheets) {
      const dataSources = await ws.getDataSourcesAsync()
      if (dataSources.some((ds) => ds.name === dataSource.name)) {
        worksheet = ws
        console.log("[v0] Worksheet encontrado:", ws.name)
        addLog(`Usando worksheet: ${ws.name}`, "info")
        break
      }
    }

    if (!worksheet) {
      throw new Error("No se encontró un worksheet que use la fuente de datos configurada")
    }

    console.log("[v0] Leyendo datos del worksheet...")

    const maxRows = TESTING_MODE ? 100 : 10
    addLog(
      TESTING_MODE
        ? "Leyendo datos (modo testing: buscando tu email)..."
        : "Leyendo tus datos (ya filtrados por Tableau)...",
      "info",
    )

    let dataTable = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[v0] Intento ${attempt}/${maxRetries} de cargar datos...`)
        addLog(`Intento ${attempt}/${maxRetries} de cargar datos...`, "info")

        // Crear promise con timeout de 10 segundos
        const dataPromise = worksheet.getSummaryDataAsync({
          maxRows: maxRows,
          ignoreSelection: true,
        })

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout al cargar datos")), 10000),
        )

        dataTable = await Promise.race([dataPromise, timeoutPromise])

        if (dataTable && dataTable.data.length > 0) {
          console.log("[v0] Datos cargados exitosamente")
          break
        } else if (attempt < maxRetries) {
          console.log("[v0] No se obtuvieron datos, esperando 2 segundos antes de reintentar...")
          addLog("No se obtuvieron datos, reintentando...", "warning")
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } catch (error) {
        console.error(`[v0] Error en intento ${attempt}:`, error)
        if (attempt === maxRetries) {
          throw new Error(`No se pudieron cargar los datos después de ${maxRetries} intentos: ${error.message}`)
        }
        addLog(`Error en intento ${attempt}, reintentando en 2 segundos...`, "warning")
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    if (!dataTable || dataTable.data.length === 0) {
      const errorMsg =
        CONFIG.errorMessage ||
        "No se encontraron datos para tu usuario. Verifica que el filtro USERNAME() esté aplicado en 'Hoja 1'"
      throw new Error(errorMsg)
    }

    console.log("[v0] Filas obtenidas:", dataTable.data.length)
    addLog(`Registros cargados: ${dataTable.data.length}`, "success")

    // En modo testing, buscar el email específico
    let targetRow = dataTable.data[0] // Por defecto, primera fila

    if (TESTING_MODE) {
      console.log("[v0] Buscando email en los datos...")
      const emailColumnIndex = dataTable.columns.findIndex((col) => col.fieldName === CONFIG.usernameColumn)

      if (emailColumnIndex === -1) {
        addLog(`No se encontró la columna ${CONFIG.usernameColumn}`, "error")
        throw new Error(`Columna ${CONFIG.usernameColumn} no existe`)
      }

      console.log("[v0] Columna EMAIL en índice:", emailColumnIndex)

      // Buscar la fila con el email de testing
      const foundRow = dataTable.data.find((row) => {
        const emailValue = row[emailColumnIndex].value
        console.log("[v0] Comparando:", emailValue, "con", TEST_EMAIL)
        return emailValue && emailValue.toUpperCase() === TEST_EMAIL.toUpperCase()
      })

      if (foundRow) {
        targetRow = foundRow
        console.log("[v0] Email encontrado en los datos!")
        addLog(`Usuario encontrado: ${TEST_EMAIL}`, "success")
      } else {
        console.error("[v0] Email NO encontrado en los datos")
        addLog(`Email ${TEST_EMAIL} no encontrado en los primeros ${maxRows} registros`, "error")

        // Mostrar algunos emails de ejemplo
        const ejemplos = dataTable.data
          .slice(0, 5)
          .map((row) => row[emailColumnIndex].value)
          .join(", ")
        console.log("[v0] Ejemplos de emails en los datos:", ejemplos)
        addLog(`Ejemplos: ${ejemplos}`, "info")

        return null
      }
    }

    const userData = {}

    // Convertir a objeto con nombres de columna
    dataTable.columns.forEach((column, index) => {
      const fieldName = column.fieldName
      const value = targetRow[index].value
      userData[fieldName] = value
      console.log("[v0] Columna:", fieldName, "=", value)
    })

    console.log("[v0] Datos del usuario:", userData)
    addLog(`Datos cargados correctamente`, "success")

    return userData
  } catch (error) {
    console.error("[v0] Error al obtener datos filtrados:", error)
    addLog(`Error al obtener datos: ${error.message}`, "error")
    throw error
  }
}

// ===========================
// Alimentar parámetros
// ===========================
async function feedParameters(userData) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    const feedResults = []

    for (const mapping of CONFIG.parameterMappings) {
      const paramName = mapping.parameterName
      const columnName = mapping.columnName

      console.log("[v0] Alimentando parámetro:", paramName, "con columna:", columnName)

      const value = userData[columnName]

      if (value === undefined || value === null) {
        console.warn("[v0] No se encontró valor para la columna:", columnName)
        addLog(`Columna '${columnName}' no encontrada en los datos`, "warning")
        continue
      }

      try {
        const parameter = await dashboard.findParameterAsync(paramName)
        await parameter.changeValueAsync(value.toString())

        console.log("[v0] Parámetro actualizado:", paramName, "=", value)
        addLog(`${paramName} = ${value}`, "success")
        feedResults.push({ parameter: paramName, value, success: true })
      } catch (error) {
        console.error("[v0] Error al actualizar parámetro:", paramName, error)
        addLog(`Error al actualizar ${paramName}: ${error.message}`, "error")
        feedResults.push({ parameter: paramName, value, success: false, error: error.message })
      }
    }

    const successCount = feedResults.filter((r) => r.success).length
    console.log("[v0] Parámetros actualizados:", successCount, "de", feedResults.length)

    if (successCount === 0) {
      throw new Error("No se pudo actualizar ningún parámetro")
    }

    return feedResults
  } catch (error) {
    console.error("[v0] Error al alimentar parámetros:", error)
    throw error
  }
}

// =========================
// Configuración de la extensión
// =========================
function configure() {
  console.log("[v1] Abriendo diálogo de configuración...")
  const popupUrl = window.location.href.replace("index.html", "config.html")
  console.log("[v1] URL de configuración:", popupUrl)

  addLog("Abriendo ventana de configuración...", "info")

  tableau.extensions.ui
    .displayDialogAsync(popupUrl, "", {
      height: 600,
      width: 700,
    })
    .then((closePayload) => {
      console.log("[v1] Configuración guardada, recargando...")
      addLog("Configuración guardada exitosamente", "success")
      setTimeout(() => {
        window.location.reload()
      }, 500)
    })
    .catch((error) => {
      if (error.toString().includes("canceled")) {
        console.log("[v1] Usuario canceló la configuración")
        addLog("Configuración cancelada por el usuario", "warning")
      } else {
        console.error("[v1] Error en configuración:", error)
        addLog("Error al abrir configuración: " + error.message, "error")
      }
    })
}

// =========================
// Cargar configuración
// =========================
function loadConfiguration() {
  try {
    console.log("[v1] Cargando configuración...")
    const settings = tableau.extensions.settings.getAll()
    console.log("[v1] Settings:", settings)

    if (settings.dataSourceName) {
      CONFIG.dataSourceName = settings.dataSourceName
      CONFIG.usernameColumn = settings.usernameColumn || "username"
      CONFIG.parameterMappings = JSON.parse(settings.parameterMappings || "[]")
      CONFIG.hideAfterLoad = settings.hideAfterLoad === "true"
      CONFIG.errorMessage = settings.errorMessage || ""

      console.log("[v1] Configuración cargada:", CONFIG)
      addLog("Configuración cargada desde settings", "success")
      return true
    } else {
      console.log("[v1] No hay configuración guardada")
      return false
    }
  } catch (error) {
    console.error("[v1] Error cargando configuración:", error)
    addLog("Error cargando configuración: " + error.message, "error")
    return false
  }
}

// =========================
// Mostrar botón de configuración
// =========================
function showConfigureButton() {
  updateStatus("warning", "Configuración Requerida", "Debes configurar la fuente de datos y mapeo de parámetros")
  configureBtn.style.display = "block"
  configureBtn.onclick = configure
}

// =========================
// Actualizar estado visual
// =========================
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

// =========================
// Mostrar error general
// =========================
function showError(message) {
  console.error("[v1]", message)

  updateStatus("error", "Error", message)
  addLog(`✗ ${message}`, "error")

  configureBtn.style.display = "block"
  configureBtn.onclick = configure
}

// =========================
// Agregar entrada al log
// =========================
function addLog(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString("es-ES")
  const logEntry = document.createElement("div")
  logEntry.className = `log-entry ${type}`
  logEntry.textContent = `[${timestamp}] ${message}`

  logContainer.appendChild(logEntry)
  logContainer.scrollTop = logContainer.scrollHeight

  console.log("[v1]", message)
}

// =========================
// Mostrar éxito personalizado
// =========================
function showSuccess(title, subtitle, roleValue) {
  updateStatus("success", title, subtitle)
  const paramsCountEl = document.getElementById("paramsCount")
  if (paramsCountEl) paramsCountEl.textContent = CONFIG.parameterMappings.length
  const loadTimeEl = document.getElementById("loadTime")
  if (loadTimeEl) loadTimeEl.textContent = `${((Date.now() - startTime) / 1000).toFixed(2)}s`
  if (infoBox) infoBox.style.display = "block"

  if (CONFIG.hideAfterLoad && roleValue && roleValue.toString().toUpperCase() !== "NO_ROLE") {
    addLog("Ocultando extensión en 2 segundos...", "info")
    setTimeout(() => {
      const extensionObject = document.querySelector(".tab-dashboard-extension-object")
      if (extensionObject) {
        extensionObject.style.display = "none"
        console.log("[v0] Extensión ocultada exitosamente")
      } else {
        console.log("[v0] No se encontró el objeto de extensión para ocultar")
      }
    }, 2000)
  } else {
    if (!CONFIG.hideAfterLoad) {
      console.log("[v0] No se oculta extensión: opción desactivada")
    } else {
      console.log("[v0] No se oculta extensión: usuario tiene NO_ROLE")
    }
  }
}
