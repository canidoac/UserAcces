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
const messageBox = document.getElementById("messageBox")
const messageText = document.getElementById("messageText")
const configureBtn = document.getElementById("configureBtn")
const logContainer = document.getElementById("logContainer")

// Verificar que tableau esté disponible
if (typeof tableau === "undefined") {
  console.error("[v1] ERROR: La API de Tableau no está cargada")
  document.getElementById("statusTitle").textContent = "Error de API"
  document.getElementById("statusSubtitle").textContent = "La API de Tableau no se cargó correctamente"
  throw new Error("Tableau API no disponible")
}

const isEditorMode = () => {
  try {
    return tableau.extensions.environment.mode === "authoring"
  } catch (e) {
    return false
  }
}

const log = (message, type = "info") => {
  if (isEditorMode()) {
    console.log(`[v0] ${message}`)
  }
  addLog(message, type)
}

// Inicializar extensión
log("Iniciando inicialización de extensión...")

tableau.extensions.initializeAsync().then(
  () => {
    startTime = Date.now()
    log("Extensión inicializada correctamente", "success")

    const editorMode = isEditorMode()

    logContainer.style.display = editorMode ? "block" : "none"

    if (editorMode) {
      configureBtn.style.display = "inline-flex"
      configureBtn.onclick = configure
    } else {
      configureBtn.style.display = "none"
    }
    // </CHANGE>

    try {
      const hasConfig = loadConfiguration()

      log("¿Tiene configuración? " + hasConfig)

      // Si no hay configuración, mostrar mensaje
      if (!hasConfig) {
        log("No hay configuración, esperando configuración del usuario")
        showConfigureButton()
        return
      }

      // Si hay configuración, ejecutar carga automática
      log("Configuración encontrada, iniciando carga automática")
      autoLoadParameters().catch((error) => {
        log("Error no capturado: " + error, "error")
        showError("Error inesperado: " + error.message)
      })
    } catch (error) {
      log("Error en proceso de inicialización: " + error, "error")
      showError("Error al procesar configuración: " + error.message)
    }
  },
  (error) => {
    log("Error al inicializar: " + error, "error")
    showError("Error al inicializar extensión: " + error.toString())
  },
)

// ============================
// Función principal (auto load)
// ============================
async function autoLoadParameters() {
  try {
    log("Iniciando autoLoadParameters")
    updateStatus("loading", "Cargando...", "Iniciando proceso de configuración")

    log("Verificando configuración...")
    updateStatus("loading", "Cargando...", "Verificando configuración guardada")
    log("CONFIG: " + JSON.stringify(CONFIG))

    if (!CONFIG.dataSourceName || CONFIG.parameterMappings.length === 0) {
      log("No hay configuración, mostrando botón")
      showConfigureButton()
      return
    }

    log("Buscando fuente de datos: " + CONFIG.dataSourceName)
    updateStatus("loading", "Cargando...", "Conectando a fuente de datos")
    const dataSource = await getDataSource(CONFIG.dataSourceName)

    if (!dataSource) {
      log(`Fuente de datos no encontrada: ${CONFIG.dataSourceName}`, "error")
      showError(`No se encontró la fuente de datos: ${CONFIG.dataSourceName}`)
      return
    }

    log(`Fuente de datos encontrada: ${dataSource.name}`, "success")

    log("Obteniendo datos ya filtrados por Tableau...")
    updateStatus("loading", "Cargando...", "Leyendo tus datos personalizados")

    const userData = await getFilteredUserData(dataSource)

    if (!userData) {
      const errorMsg = CONFIG.errorMessage || "No se encontraron datos para tu usuario"
      showError(errorMsg)
      return
    }

    log(`Datos obtenidos correctamente`, "success")

    log("Alimentando parámetros...")
    updateStatus("loading", "Cargando...", "Configurando parámetros")

    const feedResults = await feedParameters(userData)

    const firstMapping = CONFIG.parameterMappings[0]
    const firstParamValue = userData[firstMapping.columnName]

    log("Valor del parámetro principal: " + firstParamValue)

    if (!firstParamValue || firstParamValue.toString().toUpperCase() === "NO_ROLE") {
      const errorMsg = CONFIG.errorMessage || "No tienes un rol asignado. Contacta con soporte."
      log("Usuario con NO_ROLE, mostrando error")
      showError(errorMsg)
      return
    }

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2)

    const paramsList = CONFIG.parameterMappings
      .map((m) => `${m.parameterName}: ${userData[m.columnName] || "N/A"}`)
      .join(", ")

    showSuccess(`Parámetros configurados exitosamente en ${elapsedTime}s`, paramsList, firstParamValue)
  } catch (error) {
    log("Error en autoLoadParameters: " + error, "error")
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
    log("Dashboard obtenido, worksheets: " + dashboard.worksheets.length)

    // Buscar en todos los worksheets
    for (const worksheet of dashboard.worksheets) {
      log("Buscando en worksheet: " + worksheet.name)
      const dataSources = await worksheet.getDataSourcesAsync()
      log("Fuentes de datos encontradas: " + dataSources.map((ds) => ds.name).join(", "))

      const found = dataSources.find((ds) => ds.name === dataSourceName)
      if (found) {
        log("Fuente de datos encontrada!")
        return found
      }
    }

    log("Fuente de datos no encontrada")
    return null
  } catch (error) {
    log("Error en getDataSource: " + error, "error")
    throw error
  }
}

// ============================
// Obtener datos ya filtrados
// ============================
async function getFilteredUserData(dataSource) {
  try {
    log("Obteniendo datos de la fuente...")

    if (TESTING_MODE) {
      log("MODO TESTING ACTIVADO - Buscando email: " + TEST_EMAIL, "warning")
    }

    const dashboard = tableau.extensions.dashboardContent.dashboard
    const worksheets = dashboard.worksheets

    let worksheet = null
    for (const ws of worksheets) {
      const dataSources = await ws.getDataSourcesAsync()
      if (dataSources.some((ds) => ds.name === dataSource.name)) {
        worksheet = ws
        log("Worksheet encontrado: " + ws.name)
        break
      }
    }

    if (!worksheet) {
      throw new Error("No se encontró un worksheet que use la fuente de datos configurada")
    }

    log("Leyendo datos del worksheet...")

    const maxRows = TESTING_MODE ? 100 : 10

    let dataTable = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log(`Intento ${attempt}/${maxRetries} de cargar datos...`)

        const dataPromise = worksheet.getSummaryDataAsync({
          maxRows: maxRows,
          ignoreSelection: true,
        })

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout al cargar datos")), 10000),
        )

        dataTable = await Promise.race([dataPromise, timeoutPromise])

        if (dataTable && dataTable.data.length > 0) {
          log("Datos cargados exitosamente")
          break
        } else if (attempt < maxRetries) {
          log("No se obtuvieron datos, esperando 2 segundos...", "warning")
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } catch (error) {
        log(`Error en intento ${attempt}: ${error}`, "error")
        if (attempt === maxRetries) {
          throw new Error(`No se pudieron cargar los datos después de ${maxRetries} intentos`)
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    if (!dataTable || dataTable.data.length === 0) {
      throw new Error("No se encontraron datos")
    }

    log("Filas obtenidas: " + dataTable.data.length, "success")

    let targetRow = dataTable.data[0]

    if (TESTING_MODE) {
      const emailColumnIndex = dataTable.columns.findIndex((col) => col.fieldName === CONFIG.usernameColumn)

      if (emailColumnIndex === -1) {
        log(`No se encontró la columna ${CONFIG.usernameColumn}`, "error")
        throw new Error(`Columna ${CONFIG.usernameColumn} no existe`)
      }

      const foundRow = dataTable.data.find((row) => {
        const emailValue = row[emailColumnIndex].value
        return emailValue && emailValue.toUpperCase() === TEST_EMAIL.toUpperCase()
      })

      if (foundRow) {
        targetRow = foundRow
        log(`Usuario encontrado: ${TEST_EMAIL}`, "success")
      } else {
        log(`Email ${TEST_EMAIL} no encontrado`, "error")
        return null
      }
    }

    const userData = {}

    dataTable.columns.forEach((column, index) => {
      const fieldName = column.fieldName
      const value = targetRow[index].value
      userData[fieldName] = value
    })

    log("Datos cargados correctamente", "success")

    return userData
  } catch (error) {
    log("Error al obtener datos filtrados: " + error, "error")
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

      log("Alimentando parámetro: " + paramName + " con columna: " + columnName)

      const value = userData[columnName]

      if (value === undefined || value === null) {
        log(`No se encontró valor para la columna: ${columnName}`, "warning")
        continue
      }

      try {
        const parameter = await dashboard.findParameterAsync(paramName)
        await parameter.changeValueAsync(value.toString())

        log(`Parámetro actualizado: ${paramName} = ${value}`, "success")
        feedResults.push({ parameter: paramName, value, success: true })
      } catch (error) {
        log(`Error al actualizar parámetro ${paramName}: ${error}`, "error")
        feedResults.push({ parameter: paramName, value, success: false, error: error.message })
      }
    }

    const successCount = feedResults.filter((r) => r.success).length
    log("Parámetros actualizados: " + successCount + " de " + feedResults.length)

    if (successCount === 0) {
      throw new Error("No se pudo actualizar ningún parámetro")
    }

    return feedResults
  } catch (error) {
    log("Error al alimentar parámetros: " + error, "error")
    throw error
  }
}

// =========================
// Configuración de la extensión
// =========================
function configure() {
  log("Abriendo diálogo de configuración...")
  const popupUrl = window.location.href.replace("index.html", "config.html")
  log("URL de configuración: " + popupUrl)

  tableau.extensions.ui
    .displayDialogAsync(popupUrl, "", {
      height: 600,
      width: 700,
    })
    .then((closePayload) => {
      log("Configuración guardada, recargando...", "success")
      setTimeout(() => {
        window.location.reload()
      }, 500)
    })
    .catch((error) => {
      if (error.toString().includes("canceled")) {
        log("Usuario canceló la configuración", "warning")
      } else {
        log("Error en configuración: " + error, "error")
      }
    })
}

// =========================
// Cargar configuración
// =========================
function loadConfiguration() {
  try {
    log("Cargando configuración...")
    const settings = tableau.extensions.settings.getAll()
    log("Settings: " + JSON.stringify(settings))

    if (settings.dataSourceName) {
      CONFIG.dataSourceName = settings.dataSourceName
      CONFIG.usernameColumn = settings.usernameColumn || "username"
      CONFIG.parameterMappings = JSON.parse(settings.parameterMappings || "[]")
      CONFIG.hideAfterLoad = settings.hideAfterLoad === "true"
      CONFIG.errorMessage = settings.errorMessage || ""

      log("Configuración cargada: " + JSON.stringify(CONFIG))
      return true
    } else {
      log("No hay configuración guardada")
      return false
    }
  } catch (error) {
    log("Error cargando configuración: " + error, "error")
    return false
  }
}

// =========================
// Mostrar botón de configuración
// =========================
function showConfigureButton() {
  updateStatus("warning", "Configuración Requerida", "Debes configurar la extensión")

  if (isEditorMode()) {
    configureBtn.style.display = "inline-flex"
    configureBtn.onclick = configure
  } else {
    configureBtn.style.display = "none"
    showMessage("Esta extensión requiere configuración. Contacta al administrador.", "error")
  }
}

// =========================
// Actualizar estado visual
// =========================
function updateStatus(type, title, subtitle) {
  const icons = {
    loading: "ℹ",
    success: "✓",
    error: "✗",
    warning: "⚠",
  }

  statusIcon.className = `status-icon ${type}`
  statusIcon.textContent = icons[type]
  statusTitle.textContent = title
  statusSubtitle.textContent = subtitle
}

function showMessage(message, type = "info") {
  messageBox.className = `message-box ${type}`
  messageText.textContent = message
  messageBox.style.display = "block"
}

function hideMessage() {
  messageBox.style.display = "none"
}

// =========================
// Mostrar error general
// =========================
function showError(message) {
  updateStatus("error", "Error", message)
  showMessage(message, "error")
  log("Error: " + message, "error")

  if (isEditorMode()) {
    configureBtn.style.display = "inline-flex"
    configureBtn.onclick = configure
  }
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
}

// =========================
// Mostrar éxito personalizado
// =========================
function showSuccess(title, subtitle, roleValue) {
  updateStatus("success", "Completado", title)
  showMessage(subtitle, "success")
  log("Éxito: " + title, "success")

  if (CONFIG.hideAfterLoad && roleValue && roleValue.toString().toUpperCase() !== "NO_ROLE") {
    log("Ocultando extensión en 2 segundos...")
    setTimeout(() => {
      log("Ocultando extensión...")
      document.body.classList.add("hidden")
      document.body.style.display = "none"
      document.body.style.height = "0px"
      document.body.style.overflow = "hidden"

      log("Extensión ocultada")
    }, 2000)
  }
}
