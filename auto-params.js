// Importar la variable tableau
const tableau = window.tableau

// MODO TESTING: Cambia esto a true para probar con un usuario específico
const TESTING_MODE = false
const TEST_EMAIL = "andres.canido@mercadolibre.com"
// </CHANGE>

// Configuración de la extensión
const CONFIG = {
  dataSourceName: null, // Nombre de la fuente de datos (se configura después)
  worksheetName: null, // Nombre del worksheet que contiene los datos
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

const contextMenuCallbacks = {
  configure: () => {
    configure()
  },
}

tableau.extensions.initializeAsync({ configure: contextMenuCallbacks.configure }).then(
  () => {
    startTime = Date.now()
    log("Extensión inicializada correctamente", "success")

    const editorMode = isEditorMode()

    if (editorMode) {
      document.body.classList.add("editor-mode")
      log("Modo editor: extensión 10x10px en esquina superior izquierda")
    } else {
      document.body.classList.add("view-mode")
      log("Modo visualización: extensión pantalla completa")
    }

    logContainer.style.display = editorMode ? "block" : "none"

    // En modo editor, SIEMPRE mostrar el botón de configuración
    if (editorMode) {
      configureBtn.style.display = "inline-flex"
      configureBtn.onclick = configure
    } else {
      configureBtn.style.display = "none"
    }

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
    const startTime = Date.now()
    log("Iniciando carga automática de parámetros...")

    const userData = await getFilteredUserData()

    if (!userData) {
      const errorMsg = CONFIG.errorMessage || "No se pudo obtener tus datos. Por favor, contacta con soporte."
      log("No se encontraron datos del usuario", "error")
      showError(errorMsg)
      return
    }

    log("Datos cargados correctamente para tu usuario")

    const feedResults = await feedParameters(userData)

    const successCount = feedResults.filter((r) => r.success).length

    if (successCount === 0) {
      const errorMsg = CONFIG.errorMessage || "No se pudo actualizar ningún parámetro. Contacta con soporte."
      log("No se actualizó ningún parámetro", "error")
      showError(errorMsg)
      return
    }

    const firstMapping = CONFIG.parameterMappings[0]
    const firstParamValue = userData[firstMapping.columnName]

    if (
      !firstParamValue ||
      firstParamValue === null ||
      firstParamValue.toString().trim() === "" ||
      firstParamValue.toString().toUpperCase() === "NO_ROLE" ||
      firstParamValue.toString().toUpperCase() === "NULL"
    ) {
      const errorMsg = CONFIG.errorMessage || "No tienes un rol asignado. Contacta con soporte."
      log("Usuario sin rol válido (NULL, vacío o NO_ROLE), mostrando error")
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

// ============================
// Obtener fuente de datos
// ============================
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
async function getFilteredUserData() {
  try {
    log("Obteniendo datos de la fuente...")

    if (TESTING_MODE) {
      log("MODO TESTING ACTIVADO - Buscando email: " + TEST_EMAIL, "warning")
    }

    const dashboard = tableau.extensions.dashboardContent.dashboard

    let worksheet = null

    if (CONFIG.worksheetName) {
      // Si hay un worksheet configurado, usarlo directamente
      worksheet = dashboard.worksheets.find((ws) => ws.name === CONFIG.worksheetName)

      if (worksheet) {
        log(`Usando worksheet configurado: ${CONFIG.worksheetName}`)
      } else {
        throw new Error(`No se encontró el worksheet configurado: ${CONFIG.worksheetName}`)
      }
    } else {
      // Fallback: buscar en todos los worksheets (comportamiento anterior)
      log("No hay worksheet configurado, buscando en todos los worksheets...")
      const worksheets = dashboard.worksheets

      for (const ws of worksheets) {
        log("Buscando en worksheet: " + ws.name)
        const dataSources = await ws.getDataSourcesAsync()
        log("Fuentes de datos encontradas: " + dataSources.map((ds) => ds.name).join(", "))

        if (dataSources.some((ds) => ds.name === CONFIG.dataSourceName)) {
          worksheet = ws
          log("Worksheet encontrado: " + ws.name)
          break
        }
      }
    }

    if (!worksheet) {
      throw new Error("No se encontró un worksheet que use la fuente de datos configurada")
    }

    log("Leyendo datos del worksheet: " + worksheet.name)

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
// ===========================
async function feedParameters(userData) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    const feedResults = []

    log(`Alimentando ${CONFIG.parameterMappings.length} parámetros...`)

    for (const mapping of CONFIG.parameterMappings) {
      const paramName = mapping.parameterName
      const columnName = mapping.columnName

      log(`Procesando parámetro: ${paramName} con columna: ${columnName}`)

      const value = userData[columnName]

      if (value === undefined || value === null) {
        log(`No se encontró valor para la columna: ${columnName}`, "warning")
        feedResults.push({ parameter: paramName, value: null, success: false, error: "Valor no encontrado" })
        continue
      }

      try {
        log(`Buscando parámetro en dashboard: ${paramName}`)

        const parameter = await dashboard.findParameterAsync(paramName)

        log(`Parámetro encontrado. Valor actual: ${parameter.currentValue.value}`)
        log(`Cambiando a: ${value}`)

        const stringValue = value.toString()

        await parameter.changeValueAsync(stringValue)

        log(`✓ Parámetro actualizado: ${paramName} = ${value}`, "success")
        feedResults.push({ parameter: paramName, value, success: true })
      } catch (error) {
        log(`✗ Error al actualizar parámetro ${paramName}: ${error}`, "error")
        feedResults.push({ parameter: paramName, value, success: false, error: error.message })
      }
    }

    const successCount = feedResults.filter((r) => r.success).length
    const totalCount = feedResults.length

    log(`Resultado: ${successCount} de ${totalCount} parámetros actualizados exitosamente`)

    feedResults.forEach((result) => {
      if (result.success) {
        log(`  ✓ ${result.parameter}: ${result.value}`, "success")
      } else {
        log(`  ✗ ${result.parameter}: ${result.error}`, "error")
      }
    })

    if (successCount === 0) {
      throw new Error("No se pudo actualizar ningún parámetro")
    }

    if (successCount < totalCount) {
      log(`Advertencia: Solo se actualizaron ${successCount} de ${totalCount} parámetros`, "warning")
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

    if (settings.dataSourceName) {
      CONFIG.dataSourceName = settings.dataSourceName
      CONFIG.worksheetName = settings.worksheetName || null
      CONFIG.usernameColumn = settings.usernameColumn || "username"
      CONFIG.parameterMappings = JSON.parse(settings.parameterMappings || "[]")
      CONFIG.hideAfterLoad = settings.hideAfterLoad === "true"
      CONFIG.errorMessage = settings.errorMessage || ""

      log("Configuración cargada correctamente")
      log(`hideAfterLoad: ${CONFIG.hideAfterLoad}`)
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
  updateStatus("warning", "Configuración Requerida", "warning", "Debes configurar la extensión", isEditorMode())

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
function updateStatus(title, subtitle, status = "loading", message = null, isEditorMode = false) {
  const statusIcon = document.getElementById("statusIcon")
  const statusTitle = document.getElementById("statusTitle")
  const statusSubtitle = document.getElementById("statusSubtitle")
  const messageBox = document.getElementById("messageBox")
  const messageText = document.getElementById("messageText")

  statusTitle.textContent = title
  statusSubtitle.textContent = subtitle

  statusIcon.className = "status-icon " + status

  const icons = {
    loading: "ℹ",
    success: "✓",
    error: "✗",
    warning: "⚠",
  }
  statusIcon.textContent = icons[status] || "ℹ"

  if (message) {
    messageBox.style.display = "block"
    messageBox.className = "message-box " + status

    // Convertir URLs a enlaces clickeables
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const messageWithLinks = message.replace(urlRegex, '<a href="$1" target="_blank">$1</a>')
    messageText.innerHTML = messageWithLinks
  } else {
    messageBox.style.display = "none"
  }

  // Mostrar botón de configurar solo en modo editor
  const configureBtn = document.getElementById("configureBtn")
  if (isEditorMode && status === "error") {
    configureBtn.style.display = "inline-flex"
  } else {
    configureBtn.style.display = "none"
  }
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
  updateStatus("Error", "Error", "error", message, isEditorMode())
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
  // Solo verificar si debe ocultarse
  const shouldHide =
    CONFIG.hideAfterLoad === true &&
    roleValue &&
    roleValue.toString().trim() !== "" &&
    roleValue.toString().toUpperCase() !== "NO_ROLE"

  if (shouldHide) {
    log("Extensión configurada correctamente, ocultando...", "success")
    hideExtension()
    return
  }

  // Si no se oculta, mostrar mensaje de éxito
  updateStatus(`Hola ${roleValue}`, subtitle, "success", null, isEditorMode())
  log("Éxito: " + title, "success")
}

function hideExtension() {
  const editorMode = isEditorMode()

  log(`Ocultando extensión (Modo: ${editorMode ? "Editor" : "Visualización"})`)

  // Simplemente ocultar con opacity, sin cambiar tamaño ni posición
  document.body.classList.add("hidden")

  // En modo editor, mantener botón de configuración visible
  if (editorMode) {
    const configBtn = document.getElementById("configureBtn")
    if (configBtn) {
      configBtn.style.opacity = "1"
      configBtn.style.visibility = "visible"
      configBtn.style.pointerEvents = "auto"
    }
  }
}

// =========================
// Función para verificar si está en modo editor
// =========================
function checkIfEditorMode() {
  return isEditorMode()
}

// =========================
// Función para registrar mensajes en el log
// =========================
function logMessage(message, type = "info", isEditorMode = false) {
  if (isEditorMode()) {
    console.log(`[v0] ${message}`)
  }
  addLog(message, type)
}
