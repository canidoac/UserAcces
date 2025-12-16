// Importar la variable tableau
const tableau = window.tableau

// MODO TESTING: Cambia esto a true para probar con un usuario específico
const TESTING_MODE = false
const TEST_EMAIL = "andres.canido@mercadolibre.com"
// </CHANGE>

// Configuración de la extensión
const CONFIG = {
  worksheetName: "", // Nombre del worksheet que contiene los datos
  dataSourceName: "", // Nombre de la fuente de datos (se configura después)
  usernameColumn: "", // Columna que contiene el username
  parameterMappings: [], // Mapeo de columnas a parámetros
  hideAfterLoad: false,
  errorMessage: "",
  errorUrl: "",
  errorLinkText: "",
  trackingUrl: "", // URL del script de tracking configurable
  dashboardName: "", // Agregar dashboardName al CONFIG
  usernameParameter: "", // Agregar parámetro de usuario de Tableau
}

// Variables de estado
let startTime
const logEntries = []
let currentUserData = null
let currentUserEmail = "Desconocido"

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

async function getTableauUsername() {
  try {
    // Si hay un parámetro configurado, intentar leerlo
    if (CONFIG.usernameParameter) {
      const dashboard = tableau.extensions.dashboardContent.dashboard
      const parameters = await dashboard.getParametersAsync()
      const userParam = parameters.find((p) => p.name === CONFIG.usernameParameter)

      if (userParam && userParam.currentValue && userParam.currentValue.value) {
        const username = userParam.currentValue.value
        console.log("[v0] Usuario obtenido del parámetro de Tableau:", username)
        return username
      }
    }

    // Fallback a environment
    const env = tableau.extensions.environment
    if (env.userName && env.userName.trim() !== "") {
      return env.userName
    }
    if (env.userDisplayName && env.userDisplayName.trim() !== "") {
      return env.userDisplayName
    }

    return null
  } catch (error) {
    console.error("[v0] Error obteniendo usuario de Tableau:", error)
    return null
  }
}

async function sendTracking(userEmail, status) {
  try {
    // Si no hay URL de tracking configurada, no enviar nada
    if (!CONFIG.trackingUrl) {
      console.log("[v0] Tracking desactivado: No hay URL configurada")
      return
    }

    console.log("[v0] ====== DEBUG TRACKING ======")

    let finalEmail = "Desconocido"

    const tableauUsername = await getTableauUsername()
    if (tableauUsername && tableauUsername.trim() !== "") {
      finalEmail = tableauUsername
      console.log("[v0] Usando usuario del parámetro de Tableau:", finalEmail)
    }
    // 2. Intentar con el userEmail que viene del userData
    else if (userEmail && userEmail !== "Desconocido" && userEmail.trim() !== "") {
      finalEmail = userEmail
      console.log("[v0] Usando userEmail de userData:", finalEmail)
    }

    console.log("[v0] finalEmail final:", finalEmail)
    console.log("[v0] ===========================")

    // Usar el nombre del dashboard configurado, o intentar obtenerlo de Tableau
    let dashboardName = CONFIG.dashboardName || "Dashboard Desconocido"
    if (!CONFIG.dashboardName) {
      try {
        dashboardName = tableau.extensions.dashboardContent.dashboard.name || "Dashboard Desconocido"
      } catch (e) {}
    }

    const now = new Date()
    const argentinaTime = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    const horarioArgentina = argentinaTime.toISOString().replace("Z", "-03:00")

    const trackingData = {
      Email: finalEmail,
      Horario: horarioArgentina,
      Dashboard: dashboardName,
      Status: status,
    }

    console.log("[v0] Enviando tracking:", JSON.stringify(trackingData))

    // Usar Image beacon para evitar CORS
    const params = new URLSearchParams(trackingData).toString()
    const img = new Image()
    img.src = `${CONFIG.trackingUrl}?${params}`
    console.log("[v0] Tracking enviado via Image beacon a:", img.src)
  } catch (error) {
    console.error("[v0] Error en tracking:", error)
  }
}

// Mantener función legacy para compatibilidad
async function sendErrorTracking(status = "Sin Acceso") {
  // Esta función ahora solo se usa como fallback cuando no tenemos userData
  sendTracking("Desconocido", status)
}

// ============================
// Función principal (auto load)
// ============================
async function autoLoadParameters() {
  try {
    const startTime = performance.now()
    addLog("Iniciando carga automática de parámetros...", "info")

    const userData = await getFilteredUserData()

    if (!userData) {
      const errorMsg = CONFIG.errorMessage || "No se pudo obtener tus datos. Por favor, contacta con soporte."
      addLog("No se encontraron datos del usuario", "error")
      showError(errorMsg, "Desconocido")
      return
    }

    currentUserData = userData
    currentUserEmail = userData[CONFIG.usernameColumn] || "Desconocido"
    addLog(`Email del usuario: ${currentUserEmail}`)

    addLog("Datos cargados correctamente para tu usuario")

    const feedResults = await feedParameters(userData)

    const successCount = feedResults.filter((r) => r.success).length

    if (successCount === 0) {
      const errorMsg = CONFIG.errorMessage || "No se pudo actualizar ningún parámetro. Contacta con soporte."
      addLog("No se actualizó ningún parámetro", "error")
      showError(errorMsg, currentUserEmail)
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
      addLog("Usuario sin rol válido (NULL, vacío o NO_ROLE), mostrando error")
      showError(errorMsg, currentUserEmail)
      return
    }

    const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2)

    const paramsList = CONFIG.parameterMappings
      .map((m) => `${m.parameterName}: ${userData[m.columnName] || "N/A"}`)
      .join(", ")

    showSuccess(
      `Parámetros configurados exitosamente en ${elapsedTime}s`,
      paramsList,
      firstParamValue,
      currentUserEmail,
    )
  } catch (error) {
    addLog("Error en autoLoadParameters: " + error, "error")
    const errorMsg = CONFIG.errorMessage || `Error al cargar parámetros: ${error.message}`
    showError(errorMsg, currentUserEmail)
  }
}

// ============================
// Obtener fuente de datos
// ============================
async function getDataSource(dataSourceName) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    addLog("Dashboard obtenido, worksheets: " + dashboard.worksheets.length)

    // Buscar en todos los worksheets
    for (const worksheet of dashboard.worksheets) {
      addLog("Buscando en worksheet: " + worksheet.name)
      const dataSources = await worksheet.getDataSourcesAsync()
      addLog("Fuentes de datos encontradas: " + dataSources.map((ds) => ds.name).join(", "))

      const found = dataSources.find((ds) => ds.name === dataSourceName)
      if (found) {
        addLog("Fuente de datos encontrada!")
        return found
      }
    }

    addLog("Fuente de datos no encontrada")
    return null
  } catch (error) {
    addLog("Error en getDataSource: " + error, "error")
    throw error
  }
}

// ============================
// Obtener datos ya filtrados
// ============================
async function getFilteredUserData() {
  try {
    addLog("Obteniendo datos de la fuente...")

    if (TESTING_MODE) {
      addLog("MODO TESTING ACTIVADO - Buscando email: " + TEST_EMAIL, "warning")
    }

    const dashboard = tableau.extensions.dashboardContent.dashboard

    let worksheet = null

    if (CONFIG.worksheetName) {
      // Si hay un worksheet configurado, usarlo directamente
      worksheet = dashboard.worksheets.find((ws) => ws.name === CONFIG.worksheetName)

      if (worksheet) {
        addLog(`Usando worksheet configurado: ${CONFIG.worksheetName}`)
      } else {
        throw new Error(`No se encontró el worksheet configurado: ${CONFIG.worksheetName}`)
      }
    } else {
      // Fallback: buscar en todos los worksheets (comportamiento anterior)
      addLog("No hay worksheet configurado, buscando en todos los worksheets...")
      const worksheets = dashboard.worksheets

      for (const ws of worksheets) {
        addLog("Buscando en worksheet: " + ws.name)
        const dataSources = await ws.getDataSourcesAsync()
        addLog("Fuentes de datos encontradas: " + dataSources.map((ds) => ds.name).join(", "))

        if (dataSources.some((ds) => ds.name === CONFIG.dataSourceName)) {
          worksheet = ws
          addLog("Worksheet encontrado: " + ws.name)
          break
        }
      }
    }

    if (!worksheet) {
      throw new Error("No se encontró un worksheet que use la fuente de datos configurada")
    }

    addLog("Leyendo datos del worksheet: " + worksheet.name)

    const maxRows = TESTING_MODE ? 100 : 10

    let dataTable = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        addLog(`Intento ${attempt}/${maxRetries} de cargar datos...`)

        const dataPromise = worksheet.getSummaryDataAsync({
          maxRows: maxRows,
          ignoreSelection: true,
        })

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout al cargar datos")), 10000),
        )

        dataTable = await Promise.race([dataPromise, timeoutPromise])

        if (dataTable && dataTable.data.length > 0) {
          addLog("Datos cargados exitosamente")
          break
        } else if (attempt < maxRetries) {
          addLog("No se obtuvieron datos, esperando 2 segundos...", "warning")
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } catch (error) {
        addLog(`Error en intento ${attempt}: ${error}`, "error")
        if (attempt === maxRetries) {
          throw new Error(`No se pudieron cargar los datos después de ${maxRetries} intentos`)
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    if (!dataTable || dataTable.data.length === 0) {
      throw new Error("No se encontraron datos")
    }

    addLog("Filas obtenidas: " + dataTable.data.length, "success")

    let targetRow = dataTable.data[0]

    if (TESTING_MODE) {
      const emailColumnIndex = dataTable.columns.findIndex((col) => col.fieldName === CONFIG.usernameColumn)

      if (emailColumnIndex === -1) {
        addLog(`No se encontró la columna ${CONFIG.usernameColumn}`, "error")
        throw new Error(`Columna ${CONFIG.usernameColumn} no existe`)
      }

      const foundRow = dataTable.data.find((row) => {
        const emailValue = row[emailColumnIndex].value
        return emailValue && emailValue.toUpperCase() === TEST_EMAIL.toUpperCase()
      })

      if (foundRow) {
        targetRow = foundRow
        addLog(`Usuario encontrado: ${TEST_EMAIL}`, "success")
      } else {
        addLog(`Email ${TEST_EMAIL} no encontrado`, "error")
        return null
      }
    }

    const userData = {}

    dataTable.columns.forEach((column, index) => {
      const fieldName = column.fieldName
      const value = targetRow[index].value
      userData[fieldName] = value
    })

    addLog("Datos cargados correctamente", "success")

    return userData
  } catch (error) {
    addLog("Error al obtener datos filtrados: " + error, "error")
    throw error
  }
}

// ===========================
// ===========================
async function feedParameters(userData) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    const feedResults = []

    addLog(`Alimentando ${CONFIG.parameterMappings.length} parámetros...`)

    for (const mapping of CONFIG.parameterMappings) {
      const paramName = mapping.parameterName
      const columnName = mapping.columnName

      addLog(`Procesando parámetro: ${paramName} con columna: ${columnName}`)

      const value = userData[columnName]

      if (value === undefined || value === null) {
        addLog(`No se encontró valor para la columna: ${columnName}`, "warning")
        feedResults.push({ parameter: paramName, value: null, success: false, error: "Valor no encontrado" })
        continue
      }

      try {
        addLog(`Buscando parámetro en dashboard: ${paramName}`)

        const parameter = await dashboard.findParameterAsync(paramName)

        addLog(`Parámetro encontrado. Valor actual: ${parameter.currentValue.value}`)
        addLog(`Cambiando a: ${value}`)

        const stringValue = value.toString()

        await parameter.changeValueAsync(stringValue)

        addLog(`✓ Parámetro actualizado: ${paramName} = ${value}`, "success")
        feedResults.push({ parameter: paramName, value, success: true })
      } catch (error) {
        addLog(`✗ Error al actualizar parámetro ${paramName}: ${error}`, "error")
        feedResults.push({ parameter: paramName, value, success: false, error: error.message })
      }
    }

    const successCount = feedResults.filter((r) => r.success).length
    const totalCount = feedResults.length

    addLog(`Resultado: ${successCount} de ${totalCount} parámetros actualizados exitosamente`)

    feedResults.forEach((result) => {
      if (result.success) {
        addLog(`  ✓ ${result.parameter}: ${result.value}`, "success")
      } else {
        addLog(`  ✗ ${result.parameter}: ${result.error}`, "error")
      }
    })

    if (successCount === 0) {
      throw new Error("No se pudo actualizar ningún parámetro")
    }

    if (successCount < totalCount) {
      addLog(`Advertencia: Solo se actualizaron ${successCount} de ${totalCount} parámetros`, "warning")
    }

    return feedResults
  } catch (error) {
    addLog("Error al alimentar parámetros: " + error, "error")
    throw error
  }
}

// =========================
// Configuración de la extensión
// =========================
function configure() {
  addLog("Abriendo diálogo de configuración...")
  const popupUrl = window.location.href.replace("index.html", "config.html")
  addLog("URL de configuración: " + popupUrl)

  tableau.extensions.ui
    .displayDialogAsync(popupUrl, "", {
      height: 600,
      width: 700,
    })
    .then((closePayload) => {
      addLog("Configuración guardada, recargando...", "success")
      setTimeout(() => {
        window.location.reload()
      }, 500)
    })
    .catch((error) => {
      if (error.toString().includes("canceled")) {
        addLog("Usuario canceló la configuración", "warning")
      } else {
        addLog("Error en configuración: " + error, "error")
      }
    })
}

// =========================
// Cargar configuración
// =========================
async function loadConfiguration() {
  const settings = tableau.extensions.settings.getAll()
  console.log("[v0] Settings cargados:", settings)

  CONFIG.worksheetName = settings.worksheetName || ""
  CONFIG.dataSourceName = settings.dataSourceName || ""
  CONFIG.usernameColumn = settings.usernameColumn || ""
  CONFIG.hideAfterLoad = settings.hideAfterLoad === "true" || settings.hideAfterLoad === true
  CONFIG.errorMessage = settings.errorMessage || ""
  CONFIG.errorUrl = settings.errorUrl || ""
  CONFIG.errorLinkText = settings.errorLinkText || ""
  CONFIG.trackingUrl = settings.trackingUrl || ""
  CONFIG.dashboardName = settings.dashboardName || ""
  CONFIG.usernameParameter = settings.usernameParameter || ""

  if (settings.parameterMappings) {
    try {
      CONFIG.parameterMappings = JSON.parse(settings.parameterMappings)
    } catch (e) {
      console.error("[v0] Error parseando parameterMappings:", e)
      CONFIG.parameterMappings = []
    }
  }

  console.log("[v0] Configuración cargada:", CONFIG)
}

// =========================
// Mostrar botón de configuración
// =========================
function showWarning(title, subtitle) {
  updateStatus(title, subtitle, "warning", null, isEditorMode())
}

function showConfigureButton() {
  showWarning("Configuración Requerida", "Debes configurar la extensión")

  if (isEditorMode()) {
    configureBtn.style.display = "flex"
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

    // Si no, convertir URLs automáticamente a enlaces
    if (message.includes("<a href=")) {
      messageText.innerHTML = message
    } else {
      const urlRegex = /(https?:\/\/[^\s]+)/g
      const messageWithLinks = message.replace(urlRegex, '<a href="$1" target="_blank">$1</a>')
      messageText.innerHTML = messageWithLinks
    }
  } else {
    messageBox.style.display = "none"
  }

  // Mostrar botón de configurar solo en modo editor
  if (isEditorMode && status === "error") {
    configureBtn.style.display = "flex"
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
function showError(message, userEmail = "Desconocido") {
  // Enviar tracking de error a Google Apps Script con el email real
  sendTracking(userEmail, "Sin Acceso")

  // Si hay una URL de error configurada, agregar el enlace
  let displayMessage = message

  if (CONFIG.errorUrl && CONFIG.errorLinkText) {
    displayMessage = `${message}<br><br><a href="${CONFIG.errorUrl}" target="_blank" style="color: #3b82f6; text-decoration: underline; font-weight: 600;">${CONFIG.errorLinkText}</a>`
  }

  updateStatus("Error", "Error", "error", displayMessage, isEditorMode())
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
function showSuccess(title, subtitle, roleValue, userEmail = "Desconocido") {
  // Enviar tracking de acceso exitoso con el ROL como status
  sendTracking(userEmail, roleValue || "Acceso OK")

  // Solo verificar si debe ocultarse
  const shouldHide =
    CONFIG.hideAfterLoad === true &&
    roleValue &&
    roleValue.toString().trim() !== "" &&
    roleValue.toString().toUpperCase() !== "NO_ROLE"

  if (shouldHide) {
    addLog("Extensión configurada correctamente, ocultando...", "success")
    hideExtension()
    return
  }

  // Si no se oculta, mostrar mensaje de éxito
  updateStatus(`Hola ${roleValue}`, subtitle, "success", null, isEditorMode())
  addLog("Éxito: " + title, "success")
}

function hideExtension() {
  const editorMode = isEditorMode()

  addLog(`Ocultando extensión (Modo: ${editorMode ? "Editor" : "Visualización"})`)

  document.body.classList.remove("visible")
  document.body.classList.add("hidden")

  if (tableau && tableau.extensions && tableau.extensions.setClickThroughAsync) {
    tableau.extensions
      .setClickThroughAsync(true)
      .then(() => {
        addLog("Click-through habilitado correctamente")
      })
      .catch((error) => {
        addLog("Error al habilitar click-through: " + error.message)
      })
  }

  const mainContainer = document.getElementById("mainContainer")
  if (mainContainer) {
    mainContainer.style.opacity = "0"
    mainContainer.style.visibility = "hidden"
    mainContainer.style.display = "none"
  }

  const configButton = document.getElementById("configureBtn")
  if (configButton && editorMode) {
    configButton.style.display = "flex"
    configButton.style.opacity = "1"
    configButton.style.pointerEvents = "auto"
    configButton.style.visibility = "visible"
    addLog("Botón de configuración mantenido visible en modo editor")
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

// ============================
// Funciones adicionales para la inicialización optimizada
// ============================

const replaceSpinnerWhenReady = () => {
  const cssSpinner = document.getElementById("cssSpinner")
  if (cssSpinner && document.fonts) {
    document.fonts.ready.then(() => {
      cssSpinner.outerHTML = '<span class="material-symbols-outlined spinning">progress_activity</span>'
    })
  }
}

const initExtension = () => {
  // Reemplazar spinner cuando la fuente esté lista
  replaceSpinnerWhenReady()

  startTime = performance.now()
  addLog("Iniciando extensión...", "info")

  tableau.extensions
    .initializeAsync({ configure: openConfigDialog })
    .then(() => {
      addLog("API de Tableau inicializada", "success")

      if (isEditorMode()) {
        configureBtn.style.display = "flex"
        logContainer.style.display = "block"
        addLog("Modo editor detectado - Logs visibles", "info")
      }

      loadConfiguration().then(() => {
        if (CONFIG.worksheetName && CONFIG.dataSourceName && CONFIG.usernameColumn) {
          startAutoConfiguration()
        } else {
          if (isEditorMode()) {
            showWarning("Configuración requerida", "Por favor, configure la extensión para continuar")
          } else {
            showError(
              "Error",
              "La extensión no está configurada correctamente. Contacte al administrador del dashboard.",
            )
          }
        }
      })
    })
    .catch((err) => {
      console.error("[v0] Error al inicializar:", err)
      showError("Error de conexión", err.message || "No se pudo conectar con Tableau")
    })
}
;(() => {
  // Mostrar pantalla de carga inmediatamente
  document.body.classList.add("visible")
})()

if (window.tableau && window.tableau.extensions) {
  initExtension()
} else {
  // Esperar a que Tableau esté disponible
  const checkTableau = setInterval(() => {
    if (window.tableau && window.tableau.extensions) {
      clearInterval(checkTableau)
      initExtension()
    }
  }, 10)

  // Timeout de seguridad
  setTimeout(() => {
    clearInterval(checkTableau)
    if (!window.tableau || !window.tableau.extensions) {
      document.getElementById("statusTitle").textContent = "Error de API"
      document.getElementById("statusSubtitle").textContent = "La API de Tableau no se cargó correctamente"
    }
  }, 5000)
}

// Función para iniciar la configuración automática
function startAutoConfiguration() {
  autoLoadParameters().catch((error) => {
    addLog("Error no capturado: " + error, "error")
    showError("Error inesperado: " + error.message)
  })
}

// Función para abrir el diálogo de configuración
function openConfigDialog() {
  configure()
}
