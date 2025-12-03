let availableParameters = []
let mappings = []
let tableau = null
let dashboard = null
let availableColumns = []

function waitForTableau() {
  return new Promise((resolve, reject) => {
    if (window.tableau && window.tableau.extensions) {
      resolve(window.tableau)
    } else {
      let attempts = 0
      const checkInterval = setInterval(() => {
        attempts++
        if (window.tableau && window.tableau.extensions) {
          clearInterval(checkInterval)
          resolve(window.tableau)
        } else if (attempts > 50) {
          clearInterval(checkInterval)
          reject(new Error("Tableau API no se cargó"))
        }
      }, 100)
    }
  })
}

waitForTableau()
  .then((tableauResult) => {
    tableau = tableauResult
    console.log("[v0] Tableau API cargada, inicializando diálogo...")
    return tableau.extensions.initializeDialogAsync()
  })
  .then(() => {
    console.log("[v0] Diálogo de configuración inicializado")
    const payloadString = tableau.extensions.settings.get("dashboard-payload")
    if (payloadString) {
      const payload = JSON.parse(payloadString)
      console.log("[v0] Dashboard payload recibido:", payload)
    }

    if (window.parent && window.parent.tableau && window.parent.tableau.extensions) {
      dashboard = window.parent.tableau.extensions.dashboardContent.dashboard
      console.log("[v0] Dashboard obtenido del parent")
    } else {
      // Fallback: intentar obtener del contexto actual
      dashboard = tableau.extensions.dashboardContent.dashboard
      console.log("[v0] Dashboard obtenido del contexto actual")
    }

    return loadAvailableData()
  })
  .then(() => {
    loadCurrentConfiguration()
  })
  .catch((error) => {
    console.error("[v0] Error en inicialización:", error)
    alert("Error al inicializar configuración: " + error.message)
  })

async function loadAvailableData() {
  try {
    console.log("[v0] Cargando datos disponibles...")

    if (!dashboard) {
      throw new Error("No se pudo acceder al dashboard")
    }

    const dataSourceSelect = document.getElementById("dataSource")
    const allDataSources = []

    console.log("[v0] Total worksheets:", dashboard.worksheets.length)

    for (const worksheet of dashboard.worksheets) {
      console.log("[v0] Analizando worksheet:", worksheet.name)
      try {
        const dataSources = await worksheet.getDataSourcesAsync()
        console.log("[v0] Fuentes de datos en", worksheet.name, ":", dataSources.length)

        dataSources.forEach((ds) => {
          console.log("[v0] Fuente de datos encontrada:", ds.name)
          if (!allDataSources.find((existing) => existing.name === ds.name)) {
            allDataSources.push(ds)
          }
        })
      } catch (err) {
        console.error("[v0] Error obteniendo fuentes de datos del worksheet:", worksheet.name, err)
      }
    }

    console.log("[v0] Total fuentes de datos únicas:", allDataSources.length)

    if (allDataSources.length === 0) {
      console.warn("[v0] No se encontraron fuentes de datos")
      const option = document.createElement("option")
      option.value = ""
      option.textContent = "No hay fuentes de datos disponibles"
      dataSourceSelect.appendChild(option)
    } else {
      allDataSources.forEach((ds) => {
        const option = document.createElement("option")
        option.value = ds.name
        option.textContent = ds.name
        dataSourceSelect.appendChild(option)
      })
    }

    dataSourceSelect.addEventListener("change", async (e) => {
      const selectedDataSourceName = e.target.value
      if (selectedDataSourceName) {
        await loadColumnsFromDataSource(selectedDataSourceName, allDataSources)
      } else {
        availableColumns = []
      }
    })

    availableParameters = await dashboard.getParametersAsync()
    console.log(
      "[v0] Parámetros disponibles:",
      availableParameters.map((p) => p.name),
    )
  } catch (error) {
    console.error("[v0] Error cargando datos:", error)
    alert("Error al cargar datos: " + error.message)
  }
}

async function loadColumnsFromDataSource(dataSourceName, allDataSources) {
  try {
    console.log("[v0] Cargando columnas de:", dataSourceName)

    const selectedDataSource = allDataSources.find((ds) => ds.name === dataSourceName)
    if (!selectedDataSource) {
      console.error("[v0] Fuente de datos no encontrada")
      return
    }

    const logicalTables = await selectedDataSource.getLogicalTablesAsync()
    if (logicalTables.length === 0) {
      console.warn("[v0] No hay tablas lógicas en la fuente de datos")
      return
    }

    const logicalTableId = logicalTables[0].id
    const dataTable = await selectedDataSource.getLogicalTableDataAsync(logicalTableId, {
      maxRows: 1, // Solo necesitamos 1 fila para obtener las columnas
    })

    availableColumns = dataTable.columns.map((c) => c.fieldName)

    console.log("[v0] Columnas cargadas:", availableColumns)

    updateColumnDropdowns()
  } catch (error) {
    console.error("[v0] Error cargando columnas:", error)
    try {
      console.log("[v0] Intentando método alternativo para obtener columnas...")

      for (const worksheet of dashboard.worksheets) {
        const dataSources = await worksheet.getDataSourcesAsync()
        const matchingDs = dataSources.find((ds) => ds.name === dataSourceName)

        if (matchingDs) {
          const summaryData = await worksheet.getSummaryDataAsync()
          availableColumns = summaryData.columns.map((c) => c.fieldName)
          console.log("[v0] Columnas cargadas con método alternativo:", availableColumns)
          updateColumnDropdowns()
          return
        }
      }

      throw new Error("No se pudo cargar las columnas con ningún método")
    } catch (altError) {
      console.error("[v0] Error con método alternativo:", altError)
      alert(
        "Error al cargar columnas: " +
          error.message +
          ". Verifica que la fuente de datos tenga datos y esté siendo usada en algún worksheet.",
      )
    }
  }
}

function updateColumnDropdowns() {
  // Actualizar columna de username
  const usernameSelect = document.getElementById("usernameColumn")
  const currentUsernameValue = usernameSelect.value
  usernameSelect.innerHTML = '<option value="">Seleccionar...</option>'

  availableColumns.forEach((columnName) => {
    const option = document.createElement("option")
    option.value = columnName
    option.textContent = columnName
    if (columnName === currentUsernameValue || columnName.toLowerCase() === "username") {
      option.selected = true
    }
    usernameSelect.appendChild(option)
  })

  // Actualizar columnas en mapeos
  const columnSelects = document.querySelectorAll(".column-name")
  columnSelects.forEach((select) => {
    const currentValue = select.value
    select.innerHTML = '<option value="">Seleccionar...</option>'

    availableColumns.forEach((columnName) => {
      const option = document.createElement("option")
      option.value = columnName
      option.textContent = columnName
      if (columnName === currentValue) {
        option.selected = true
      }
      select.appendChild(option)
    })
  })
}

// Cargar configuración actual
function loadCurrentConfiguration() {
  const settings = tableau.extensions.settings.getAll()

  if (settings.dataSourceName) {
    document.getElementById("dataSource").value = settings.dataSourceName
    document.getElementById("usernameColumn").value = settings.usernameColumn || "username"

    mappings = JSON.parse(settings.parameterMappings || "[]")

    const dataSourceSelect = document.getElementById("dataSource")
    const event = new Event("change")
    dataSourceSelect.dispatchEvent(event)

    // Esperar un poco para que las columnas se carguen antes de agregar mapeos
    setTimeout(() => {
      mappings.forEach((mapping) => addMapping(mapping))
    }, 500)
  } else {
    addMapping()
  }
}

// Agregar nuevo mapeo
function addMapping(existingMapping = null) {
  const container = document.getElementById("mappingsContainer")
  const index = mappings.length

  const mappingDiv = document.createElement("div")
  mappingDiv.className = "mapping-section"

  mappingDiv.innerHTML = `
    <div style="display: flex; gap: 10px; align-items: end;">
      <div style="flex: 1;">
        <label>Columna de Datos:</label>
        <select class="column-name">
          <option value="">Seleccionar...</option>
          ${availableColumns
            .map(
              (col) =>
                `<option value="${col}" ${existingMapping && existingMapping.columnName === col ? "selected" : ""}>
              ${col}
            </option>`,
            )
            .join("")}
        </select>
      </div>
      <div style="flex: 1;">
        <label>Parámetro de Tableau:</label>
        <select class="parameter-name">
          <option value="">Seleccionar...</option>
          ${availableParameters
            .map(
              (p) =>
                `<option value="${p.name}" ${existingMapping && existingMapping.parameterName === p.name ? "selected" : ""}>
              ${p.name}
            </option>`,
            )
            .join("")}
        </select>
      </div>
      <button class="btn-remove" onclick="removeMapping(this)">✗</button>
    </div>
  `

  container.appendChild(mappingDiv)

  if (!existingMapping) {
    mappings.push({ columnName: "", parameterName: "" })
  }
}

// Eliminar mapeo
function removeMapping(button) {
  const mappingDiv = button.closest(".mapping-section")
  const index = Array.from(mappingDiv.parentNode.children).indexOf(mappingDiv)

  mappings.splice(index, 1)
  mappingDiv.remove()
}

// Guardar configuración
function saveConfiguration() {
  const dataSourceName = document.getElementById("dataSource").value
  const usernameColumn = document.getElementById("usernameColumn").value

  console.log("[v0] Guardando configuración...")
  console.log("[v0] Fuente de datos:", dataSourceName)
  console.log("[v0] Columna username:", usernameColumn)

  if (!dataSourceName) {
    alert("Debes seleccionar una fuente de datos")
    return
  }

  const mappingDivs = document.querySelectorAll(".mapping-section")
  mappings = []

  mappingDivs.forEach((div) => {
    const columnName = div.querySelector(".column-name").value
    const parameterName = div.querySelector(".parameter-name").value

    if (columnName && parameterName) {
      mappings.push({ columnName, parameterName })
    }
  })

  console.log("[v0] Mapeos:", mappings)

  if (mappings.length === 0) {
    alert("Debes agregar al menos un mapeo de columna a parámetro")
    return
  }

  tableau.extensions.settings.set("dataSourceName", dataSourceName)
  tableau.extensions.settings.set("usernameColumn", usernameColumn)
  tableau.extensions.settings.set("parameterMappings", JSON.stringify(mappings))

  tableau.extensions.settings
    .saveAsync()
    .then(() => {
      console.log("[v0] Configuración guardada exitosamente")
      tableau.extensions.ui.closeDialog("saved")
    })
    .catch((error) => {
      console.error("[v0] Error guardando configuración:", error)
      alert("Error al guardar: " + error.message)
    })
}

// Cerrar diálogo
function closeDialog() {
  tableau.extensions.ui.closeDialog("cancelled")
}
