// Importar la variable tableau
const tableau = window.tableau

// MODO TESTING: Cambia esto a true para probar con un usuario específico
const TESTING_MODE = false
const TEST_EMAIL = "andres.canido@mercadolibre.com"
// </CHANGE>

// Configuración de la extensión
const CONFIG = {
  dataSourceName: "", // Nombre de la fuente de datos (se configura después)
  worksheetName: "", // Nombre del worksheet que contiene los datos
  usernameColumn: "", // Columna que contiene el username
  parameterMappings: [], // Mapeo de columnas a parámetros
  hideAfterLoad: false,
  errorMessage: "",
  errorUrl: "",
  errorLinkText: "",
  dashboardName: "", // Agregar dashboardName al CONFIG
  trackingUrl: "", // URL del script de tracking configurable
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

async function sendTracking(userEmail, status) {
  try {
    // Si no hay URL de tracking configurada, no enviar nada
    if (!CONFIG.trackingUrl) {
      console.log("[v0] Tracking desactivado: No hay URL configurada")
      return
    }

    const env = tableau.extensions.environment

    console.log("[v0] ====== DEBUG TRACKING ======")
    console.log("[v0] Todas las keys del environment:", Object.keys(env))
    console.log("[v0] Todas las propiedades (getOwnPropertyNames):", Object.getOwnPropertyNames(env))

    // Intentar acceder al _uniqueUserId de diferentes formas
    console.log("[v0] env._uniqueUserId:", env._uniqueUserId)
    console.log("[v0] env['_uniqueUserId']:", env["_uniqueUserId"])

    // Buscar cualquier propiedad que contenga "user" o "User"
    for (const key of Object.keys(env)) {
      if (key.toLowerCase().includes("user") || key.toLowerCase().includes("id")) {
        console.log(`[v0] env.${key}:`, env[key])
      }
    }

    let finalEmail = "Desconocido"

    // 1. Primero intentar con el userEmail que viene del userData
    if (userEmail && userEmail !== "Desconocido" && userEmail.trim() !== "") {
      finalEmail = userEmail
      console.log("[v0] Usando userEmail de userData:", finalEmail)
    }
    // 2. Intentar userName de Tableau (Tableau Server)
    else if (env.userName && env.userName.trim() !== "") {
      finalEmail = env.userName
      console.log("[v0] Usando userName:", finalEmail)
    }
    // 3. Intentar userDisplayName de Tableau
    else if (env.userDisplayName && env.userDisplayName.trim() !== "") {
      finalEmail = env.userDisplayName
      console.log("[v0] Usando userDisplayName:", finalEmail)
    }
    // 4. Usar _uniqueUserId de Tableau Cloud
    else {
      // Intentar todas las formas posibles de acceder
      const uniqueId = env._uniqueUserId || env["_uniqueUserId"]
      console.log("[v0] uniqueId encontrado:", uniqueId)

      if (uniqueId) {
        finalEmail = `user_${uniqueId.substring(0, 12)}`
        console.log("[v0] Usando _uniqueUserId:", finalEmail)
      }
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

    const trackingData = {
      Email: finalEmail,
      Horario: new Date().toISOString(),
      Dashboard: dashboardName,
      Status: status,
    }

    console.log("[v0] Enviando tracking:", JSON.stringify(trackingData))

    // Usar Image beacon para evitar CORS
    const params = new URLSearchParams(trackingData).toString()
    const img = new Image()
    img.src = `${CONFIG.trackingUrl}?${params}`

    console.log("[v0] Tracking enviado via Image beacon")
  } catch (error) {
    console.error("[v0] Error enviando tracking:", error)
  }
}

// Mantener función legacy para compatibilidad
async function sendErrorTracking(status = "Sin Acceso") {
  // Esta función ahora solo se usa como fallback cuando no tenemos userData
  sendTracking("Desconocido", status)
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

    document.body.classList.add("visible")

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
      showError(errorMsg, "Desconocido")
      return
    }

    currentUserData = userData
    currentUserEmail = userData[CONFIG.usernameColumn] || "Desconocido"
    log(`Email del usuario: ${currentUserEmail}`)

    log("Datos cargados correctamente para tu usuario")

    const feedResults = await feedParameters(userData)

    const successCount = feedResults.filter((r) => r.success).length

    if (successCount === 0) {
      const errorMsg = CONFIG.errorMessage || "No se pudo actualizar ningún parámetro. Contacta con soporte."
      log("No se actualizó ningún parámetro", "error")
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
      log("Usuario sin rol válido (NULL, vacío o NO_ROLE), mostrando error")
      showError(errorMsg, currentUserEmail)
      return
    }

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2)

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
    log("Error en autoLoadParameters: " + error, "error")
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

    log("Settings cargados: " + JSON.stringify(settings))

    if (settings.configured === "true") {
      CONFIG.worksheetName = settings.worksheetName || ""
      CONFIG.dataSourceName = settings.dataSourceName || ""
      CONFIG.usernameColumn = settings.usernameColumn || ""
      CONFIG.parameterMappings = settings.parameterMappings ? JSON.parse(settings.parameterMappings) : []
      CONFIG.hideAfterLoad = settings.hideAfterLoad === "true"
      CONFIG.errorMessage = settings.errorMessage || ""
      CONFIG.errorUrl = settings.errorUrl || ""
      CONFIG.errorLinkText = settings.errorLinkText || ""
      CONFIG.dashboardName = settings.dashboardName || "" // Cargar dashboardName
      CONFIG.trackingUrl = settings.trackingUrl || "" // Cargar trackingUrl

      log("Configuración cargada correctamente")
      log("hideAfterLoad: " + CONFIG.hideAfterLoad)
      log("dashboardName: " + CONFIG.dashboardName)
      log("trackingUrl: " + CONFIG.trackingUrl)
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

  document.body.classList.remove("visible")
  document.body.classList.add("hidden")

  if (tableau && tableau.extensions && tableau.extensions.setClickThroughAsync) {
    tableau.extensions
      .setClickThroughAsync(true)
      .then(() => {
        log("Click-through habilitado correctamente")
      })
      .catch((error) => {
        log("Error al habilitar click-through: " + error.message)
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
    log("Botón de configuración mantenido visible en modo editor")
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
