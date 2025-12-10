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

    if (!editorMode) {
      document.body.style.width = "100vw"
      document.body.style.height = "100vh"
      document.body.style.position = "fixed"
      document.body.style.top = "0"
      document.body.style.left = "0"
      document.body.style.padding = "20px"
    }

    logContainer.style.display = editorMode ? "block" : "none"

    // En modo editor, SIEMPRE mostrar el botón de configuración
    if (editorMode) {
      configureBtn.style.display = "inline-flex"
      configureBtn.onclick = configure

      // Agregar estilo especial para que sea visible incluso cuando la extensión está oculta
      configureBtn.style.position = "fixed"
      configureBtn.style.top = "10px"
      configureBtn.style.right = "10px"
      configureBtn.style.zIndex = "10000"
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
    log("Iniciando autoLoadParameters")
    updateStatus("loading", "Cargando...", "loading", null, isEditorMode())

    log("Verificando configuración...")
    updateStatus("loading", "Cargando...", "loading", null, isEditorMode())
    log("CONFIG: " + JSON.stringify(CONFIG))

    if (!CONFIG.dataSourceName || CONFIG.parameterMappings.length === 0) {
      log("No hay configuración, mostrando botón")
      showConfigureButton()
      return
    }

    log("Buscando fuente de datos: " + CONFIG.dataSourceName)
    updateStatus("loading", "Cargando...", "loading", null, isEditorMode())
    const dataSource = await getDataSource(CONFIG.dataSourceName)

    if (!dataSource) {
      log(`Fuente de datos no encontrada: ${CONFIG.dataSourceName}`, "error")
      showError(`No se encontró la fuente de datos: ${CONFIG.dataSourceName}`)
      return
    }

    log(`Fuente de datos encontrada: ${dataSource.name}`, "success")

    log("Obteniendo datos ya filtrados por Tableau...")
    updateStatus("loading", "Cargando...", "loading", null, isEditorMode())

    const userData = await getFilteredUserData(dataSource)

    if (!userData) {
      const errorMsg = CONFIG.errorMessage || "No se encontraron datos para tu usuario"
      showError(errorMsg)
      return
    }

    log(`Datos obtenidos correctamente`, "success")

    log("Alimentando parámetros...")
    updateStatus("loading", "Cargando...", "loading", null, isEditorMode())

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

        if (dataSources.some((ds) => ds.name === dataSource.name)) {
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

    console.log("[v0] ===== INICIO FEED PARAMETERS =====")
    console.log("[v0] userData recibido:", userData)
    console.log("[v0] CONFIG.parameterMappings:", CONFIG.parameterMappings)
    console.log("[v0] Número de mapeos:", CONFIG.parameterMappings.length)

    log(`Alimentando ${CONFIG.parameterMappings.length} parámetros...`)

    for (const mapping of CONFIG.parameterMappings) {
      const paramName = mapping.parameterName
      const columnName = mapping.columnName

      console.log("[v0] --------------------------------")
      console.log("[v0] Procesando mapping:", mapping)
      console.log("[v0] parameterName:", paramName)
      console.log("[v0] columnName:", columnName)

      log(`Procesando parámetro: ${paramName} con columna: ${columnName}`)

      const value = userData[columnName]

      console.log("[v0] Valor obtenido de userData['" + columnName + "']:", value)
      console.log("[v0] Tipo de valor:", typeof value)

      if (value === undefined || value === null) {
        console.log("[v0] ✗ Valor no encontrado o es null/undefined")
        log(`No se encontró valor para la columna: ${columnName}`, "warning")
        feedResults.push({ parameter: paramName, value: null, success: false, error: "Valor no encontrado" })
        continue
      }

      try {
        log(`Buscando parámetro en dashboard: ${paramName}`)
        console.log("[v0] Buscando parámetro:", paramName)

        const parameter = await dashboard.findParameterAsync(paramName)

        console.log("[v0] Parámetro encontrado:", parameter.name)
        console.log("[v0] Valor actual del parámetro:", parameter.currentValue.value)
        console.log("[v0] Tipo de valor actual:", parameter.currentValue.dataType)

        log(`Parámetro encontrado. Valor actual: ${parameter.currentValue.value}`)
        log(`Cambiando a: ${value}`)

        const stringValue = value.toString()
        console.log("[v0] Valor convertido a string:", stringValue)

        await parameter.changeValueAsync(stringValue)

        console.log("[v0] ✓ Parámetro actualizado exitosamente")

        log(`✓ Parámetro actualizado: ${paramName} = ${value}`, "success")
        feedResults.push({ parameter: paramName, value, success: true })
      } catch (error) {
        console.log("[v0] ✗ Error al actualizar parámetro:", error)
        console.log("[v0] Error.message:", error.message)
        console.log("[v0] Error.stack:", error.stack)

        log(`✗ Error al actualizar parámetro ${paramName}: ${error}`, "error")
        feedResults.push({ parameter: paramName, value, success: false, error: error.message })
      }
    }

    const successCount = feedResults.filter((r) => r.success).length
    const totalCount = feedResults.length

    console.log("[v0] ===== FIN FEED PARAMETERS =====")
    console.log("[v0] Total intentados:", totalCount)
    console.log("[v0] Exitosos:", successCount)
    console.log("[v0] Fallidos:", totalCount - successCount)
    console.log("[v0] Resultados detallados:", feedResults)

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
    console.log("[v0] ERROR FATAL en feedParameters:", error)
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
      CONFIG.worksheetName = settings.worksheetName || null
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
  log("showSuccess llamado con roleValue: " + roleValue)
  log("CONFIG.hideAfterLoad: " + CONFIG.hideAfterLoad)

  // Si está configurado para ocultar y el rol es válido, ocultar inmediatamente sin mostrar mensaje
  if (CONFIG.hideAfterLoad && roleValue && roleValue.toString().toUpperCase() !== "NO_ROLE") {
    log("Condiciones cumplidas para ocultar. Ocultando inmediatamente...")
    hideExtension()
    return
  }

  // Si no se va a ocultar, mostrar el mensaje de éxito normalmente
  log("Mostrando mensaje de éxito sin ocultar")
  updateStatus(`Hola ${roleValue}`, subtitle, "success", null, isEditorMode())
  log("Éxito: " + title, "success")
}

function checkIfEditorMode() {
  return isEditorMode()
}

function hideExtension() {
  const editorMode = isEditorMode()

  if (editorMode) {
    log("En modo editor, manteniendo botón de configuración visible y accesible")

    // Ocultar todo el contenedor principal
    const mainContainer = document.querySelector(".container")
    if (mainContainer) {
      mainContainer.style.opacity = "0"
      setTimeout(() => {
        mainContainer.style.display = "none"
      }, 50)
    }

    // ASEGURAR que el botón de configuración permanezca visible y fijo
    const configBtn = document.getElementById("configureBtn")
    if (configBtn) {
      configBtn.style.display = "inline-flex"
      configBtn.style.position = "fixed"
      configBtn.style.top = "10px"
      configBtn.style.right = "10px"
      configBtn.style.zIndex = "99999"
      configBtn.style.opacity = "1"
      configBtn.style.visibility = "visible"
      configBtn.onclick = configure
    }
    return
  }

  // En modo de visualización, ocultar completamente
  document.body.style.opacity = "0"
  document.body.style.transition = "none"

  setTimeout(() => {
    document.body.classList.add("hidden")
    document.body.style.display = "block"
    document.body.style.width = "1px"
    document.body.style.height = "1px"
    document.body.style.position = "fixed"
    document.body.style.top = "0"
    document.body.style.left = "0"
    document.body.style.overflow = "hidden"
  }, 50)
}

function logMessage(message, type = "info", isEditorMode = false) {
  if (isEditorMode()) {
    console.log(`[v0] ${message}`)
  }
  addLog(message, type)
}
