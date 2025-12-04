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
    console.log("[v1] Iniciando autoLoadParameters")
    updateStatus("loading", "Paso 1/6: Iniciando...", "Cargando extensión")

    // 1. Obtener username del usuario actual
    console.log("[v1] Obteniendo username...")
    updateStatus("loading", "Paso 2/6: Obteniendo usuario...", "Detectando tu usuario de Tableau")
    const username = tableau.extensions.environment.username || "Usuario Desconocido"
    console.log("[v1] Username obtenido:", username)
    addLog(`Usuario detectado: ${username}`, "success")
    const usernameEl = document.getElementById("username")
    if (usernameEl) usernameEl.textContent = username

    // 2. Verificar que existe configuración
    console.log("[v1] Verificando configuración...")
    updateStatus("loading", "Paso 3/6: Verificando configuración...", "Cargando settings guardados")
    console.log("[v1] CONFIG:", CONFIG)

    if (!CONFIG.dataSourceName || CONFIG.parameterMappings.length === 0) {
      console.log("[v1] No hay configuración, mostrando botón")
      addLog("No hay configuración. Debes configurar la fuente de datos y mapeos de parámetros.", "warning")
      showConfigureButton()
      return
    }

    // 3. Obtener la fuente de datos configurada
    console.log("[v1] Buscando fuente de datos:", CONFIG.dataSourceName)
    updateStatus("loading", "Paso 4/6: Buscando fuente de datos...", `Conectando a: ${CONFIG.dataSourceName}`)
    const dataSource = await getDataSource(CONFIG.dataSourceName)

    if (!dataSource) {
      const msg = `No se encontró la fuente de datos: ${CONFIG.dataSourceName}`
      addLog(msg, "error")
      throw new Error(msg)
    }
    addLog(`Fuente de datos encontrada: ${CONFIG.dataSourceName}`, "success")

    // 4. Obtener datos del usuario
    console.log("[v1] Obteniendo datos del usuario...")
    updateStatus(
      "loading",
      "Paso 5/6: Buscando tus datos...",
      `Filtrando por usuario en columna ${CONFIG.usernameColumn}`,
    )
    addLog(`Filtrando por usuario: ${username}...`, "info")
    const userData = await getFilteredUserData(dataSource, username)

    if (!userData || userData.length === 0) {
      const msg = `No se encontraron datos para el usuario: ${username}`
      addLog(msg, "warning")
      throw new Error(msg)
    }
    addLog(`Datos del usuario obtenidos (${userData.length} registro)`, "success")

    // 5. Alimentar parámetros con los datos del usuario
    console.log("[v1] Alimentando parámetros...")
    updateStatus("loading", "Paso 6/6: Alimentando parámetros...", "Actualizando valores de parámetros")
    const loadedParams = await feedParameters(userData[0], dataSource)

    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2)

    const paramsText = loadedParams.map((p) => `${p.name}: ${p.value}`).join(", ")
    const greeting = `Hola ${username}`
    const message =
      loadedParams.length > 0
        ? `Estos son tus parámetros: ${paramsText}`
        : "No se pudo actualizar ningún parámetro. Revisa nombres de parámetros/columnas."

    updateStatus("success", greeting, message)
    if (usernameEl) usernameEl.textContent = username
    const paramsCountEl = document.getElementById("paramsCount")
    if (paramsCountEl) paramsCountEl.textContent = loadedParams.length
    const loadTimeEl = document.getElementById("loadTime")
    if (loadTimeEl) loadTimeEl.textContent = `${loadTime}s`
    if (infoBox) infoBox.style.display = "block"

    addLog(`✓ Proceso completado en ${loadTime}s`, "success")
  } catch (error) {
    console.error("[v1] Error en autoLoadParameters:", error)
    showError("Error al cargar parámetros: " + error.message)
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

// =========================
// Obtener datos del usuario
// =========================
async function getFilteredUserData(dataSource, username) {
  try {
    console.log("[v1] Buscando worksheet que use la fuente de datos:", dataSource.name)
    addLog("Obteniendo datos de la fuente...", "info")
    updateStatus("loading", "Paso 5a/6: Buscando worksheet...", `Localizando worksheet con datos`)

    const dashboard = tableau.extensions.dashboardContent.dashboard
    let worksheetWithData = null

    // Buscar un worksheet que use esta fuente de datos
    for (const worksheet of dashboard.worksheets) {
      const dataSources = await worksheet.getDataSourcesAsync()
      if (dataSources.some((ds) => ds.name === dataSource.name)) {
        worksheetWithData = worksheet
        console.log("[v1] Worksheet encontrado:", worksheet.name)
        addLog(`Worksheet encontrado: ${worksheet.name}`, "success")
        break
      }
    }

    if (!worksheetWithData) {
      throw new Error("No se encontró un worksheet que use esta fuente de datos")
    }

    console.log("[v1] Iniciando carga incremental de datos...")
    const usernameUpper = String(username).trim().toUpperCase()
    addLog(`Buscando usuario: "${usernameUpper}" en columna "${CONFIG.usernameColumn}"`, "info")

    // Cargar en lotes: 100 -> 1000 -> 10000 -> 50000
    const batchSizes = [100, 1000, 10000, 50000]

    for (const batchSize of batchSizes) {
      console.log(`[v1] Intentando cargar ${batchSize} filas...`)
      updateStatus(
        "loading",
        `Paso 5b/6: Cargando datos (${batchSize} registros)...`,
        `Buscando tu usuario en la base de datos`,
      )
      addLog(`Cargando ${batchSize} registros...`, "info")

      const dataTable = await worksheetWithData.getSummaryDataAsync({
        maxRows: batchSize,
        ignoreAliases: false,
        ignoreSelection: true,
      })

      console.log(`[v1] Filas cargadas: ${dataTable.data.length}`)
      addLog(`Filas cargadas: ${dataTable.data.length}`, "info")

      // Buscar el índice de la columna de username
      const usernameColumnIndex = dataTable.columns.findIndex(
        (col) => col.fieldName.toLowerCase() === CONFIG.usernameColumn.toLowerCase(),
      )

      if (usernameColumnIndex === -1) {
        addLog(`Columnas disponibles: ${dataTable.columns.map((c) => c.fieldName).join(", ")}`, "warning")
        throw new Error(`No se encontró la columna: ${CONFIG.usernameColumn}`)
      }

      console.log(`[v1] Índice de columna username: ${usernameColumnIndex}`)
      addLog(`Buscando en columna "${CONFIG.usernameColumn}" (índice ${usernameColumnIndex})`, "info")

      const sampleValues = dataTable.data
        .slice(0, 5)
        .map((row) => String(row[usernameColumnIndex].value).trim().toUpperCase())
      console.log(`[v1] Primeros 5 valores en la columna:`, sampleValues)
      addLog(`Ejemplos de valores: ${sampleValues.join(", ")}`, "info")

      // Buscar el usuario en este lote
      const userData = dataTable.data.filter((row) => {
        const cellValue = row[usernameColumnIndex].value
        const cellValueUpper = String(cellValue).trim().toUpperCase()
        const matches = cellValueUpper === usernameUpper
        if (matches) {
          console.log(`[v1] MATCH ENCONTRADO: "${cellValueUpper}" === "${usernameUpper}"`)
        }
        return matches
      })

      if (userData.length > 0) {
        console.log(`[v1] ✓ Usuario encontrado en ${batchSize} filas`)
        addLog(`✓ Usuario encontrado en ${batchSize} registros`, "success")

        // Cachear la tabla de datos para feedParameters
        window._cachedDataTable = dataTable

        return userData
      }

      // Si ya cargamos todas las filas disponibles, no intentar más lotes
      if (dataTable.data.length < batchSize) {
        console.log(`[v1] Solo hay ${dataTable.data.length} filas disponibles, no hay más datos`)
        addLog(`Tabla completa cargada (${dataTable.data.length} registros)`, "info")
        break
      }

      console.log(`[v1] Usuario no encontrado en ${batchSize} filas, intentando con más...`)
      addLog(`Usuario no encontrado en ${batchSize} filas, intentando con más...`, "warning")
    }

    console.log("[v1] ❌ Usuario no encontrado después de buscar en todos los lotes")
    addLog(`⚠ No se encontró el usuario "${username}" en la columna "${CONFIG.usernameColumn}"`, "warning")
    addLog(`💡 Username buscado (uppercase): "${usernameUpper}"`, "info")
    addLog(`💡 Verifica que tu username de Tableau coincida exactamente con un valor en la columna`, "info")

    return []
  } catch (error) {
    console.error("[v1] Error al obtener datos:", error)
    addLog("Error al obtener datos: " + error.message, "error")
    throw error
  }
}

// ===========================
// Alimentar parámetros (clave)
// ===========================
async function feedParameters(userDataRow, dataSource) {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard
    const parameters = await dashboard.getParametersAsync()

    addLog("Obteniendo parámetros del dashboard...", "info")
    console.log(
      "[v1] Parámetros disponibles:",
      parameters.map((p) => p.name),
    )
    console.log("[v1] Mapeos configurados:", CONFIG.parameterMappings)
    addLog(`Parámetros disponibles: ${parameters.map((p) => p.name).join(", ")}`, "info")
    addLog(`Mapeos configurados: ${JSON.stringify(CONFIG.parameterMappings)}`, "info")

    const dataTable = window._cachedDataTable
    if (!dataTable) {
      throw new Error("No hay datos cacheados disponibles (no se encontró _cachedDataTable)")
    }

    const columnNames = dataTable.columns.map((c) => c.fieldName)
    console.log("[v1] Columnas disponibles:", columnNames)
    addLog(`Columnas disponibles en fuente: ${columnNames.join(", ")}`, "info")

    const loadedParams = []

    for (const mapping of CONFIG.parameterMappings) {
      try {
        addLog(`Procesando mapeo: columna "${mapping.columnName}" → parámetro "${mapping.parameterName}"`, "info")
        console.log("[v1] Procesando mapeo:", mapping)

        // 1. Encontrar el parámetro
        const parameter = parameters.find((p) => p.name === mapping.parameterName)
        if (!parameter) {
          const msg = `⚠ Parámetro no encontrado: ${mapping.parameterName}`
          addLog(msg, "warning")
          console.warn("[v1]", msg)
          continue
        }

        // 2. Encontrar el índice de la columna
        const columnIndex = columnNames.findIndex(
          (name) => name.toLowerCase() === mapping.columnName.toLowerCase(),
        )
        console.log("[v1] Índice de columna:", columnIndex)

        if (columnIndex === -1) {
          const msg = `⚠ Columna no encontrada en dataTable: ${mapping.columnName}`
          addLog(msg, "warning")
          console.warn("[v1]", msg)
          continue
        }

        // 3. Obtener el valor de la columna de este usuario
        const rawValue = userDataRow[columnIndex].value
        console.log("[v1] Valor bruto obtenido:", rawValue)
        addLog(
          `Valor encontrado para columna "${mapping.columnName}" (fila usuario): "${rawValue}"`,
          "info",
        )

        // 4. Info del parámetro
        console.log("[v1] Parámetro:", {
          name: parameter.name,
          dataType: parameter.dataType,
          currentValue: parameter.currentValue,
          allowableValues: parameter.allowableValues,
        })
        addLog(
          `Parámetro "${parameter.name}" (tipo: ${parameter.dataType}) valor actual: "${parameter.currentValue.formattedValue}"`,
          "info",
        )

        // 5. Convertir valor según tipo de parámetro
        let finalValue = rawValue

        if (
          parameter.dataType === tableau.ParameterDataType.Float ||
          parameter.dataType === tableau.ParameterDataType.Int
        ) {
          finalValue = Number(rawValue)
          if (isNaN(finalValue)) {
            const msg = `✗ No se pudo convertir el valor "${rawValue}" a número para el parámetro "${parameter.name}"`
            addLog(msg, "error")
            console.error("[v1]", msg)
            continue
          }
        } else if (parameter.dataType === tableau.ParameterDataType.Boolean) {
          const strVal = String(rawValue).trim().toLowerCase()
          finalValue = strVal === "true" || strVal === "1" || strVal === "sí" || strVal === "si"
        } else if (parameter.dataType === tableau.ParameterDataType.Date) {
          const d = new Date(rawValue)
          if (isNaN(d.getTime())) {
            const msg = `✗ No se pudo convertir el valor "${rawValue}" a fecha para el parámetro "${parameter.name}"`
            addLog(msg, "error")
            console.error("[v1]", msg)
            continue
          }
          finalValue = d
        } else {
          // String u otros: lo dejamos como string
          finalValue = String(rawValue)
        }

        // 6. Validar contra allowableValues si es lista
        if (
          parameter.allowableValues &&
          parameter.allowableValues.type === tableau.ParameterValueType.List
        ) {
          const allowed = parameter.allowableValues.allowableValues.map((v) => v.formattedValue)
          if (!allowed.includes(String(finalValue))) {
            addLog(
              `⚠ El valor "${finalValue}" no está en la lista de valores permitidos del parámetro "${parameter.name}". Valores permitidos: ${allowed.join(", ")}`,
              "warning",
            )
            // Se continúa igual para ver si Tableau lo acepta o no.
          }
        }

        // 7. Intentar cambiar el valor del parámetro
        try {
          await parameter.changeValueAsync(finalValue)
          addLog(`✓ Parámetro "${mapping.parameterName}" actualizado a "${finalValue}"`, "success")
          console.log(
            "[v1] Parámetro actualizado:",
            parameter.name,
            "nuevo valor:",
            finalValue,
          )

          loadedParams.push({
            name: mapping.parameterName,
            value: String(finalValue),
          })
        } catch (changeError) {
          const msg = `✗ Error al cambiar el valor del parámetro "${mapping.parameterName}": ${changeError.message || changeError}`
          addLog(msg, "error")
          console.error("[v1]", msg, changeError)
        }
      } catch (error) {
        console.error("[v1] Error en parámetro:", error)
        addLog(`✗ Error en parámetro "${mapping.parameterName}": ${error.message}`, "error")
      }
    }

    if (loadedParams.length === 0) {
      addLog(
        "⚠ No se actualizó ningún parámetro. Revisa que los nombres de parámetros y columnas coincidan exactamente y que los tipos de dato sean compatibles.",
        "warning",
      )
    }

    return loadedParams
  } catch (error) {
    console.error("[v1] Error en feedParameters:", error)
    addLog("✗ Error general en feedParameters: " + error.message, "error")
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
