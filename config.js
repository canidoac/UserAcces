let availableParameters = []
let mappings = []
let tableau = null
let dashboard = null
let availableColumns = []
let worksheets = []

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

    const worksheetSelect = document.getElementById("worksheet")
    worksheets = dashboard.worksheets

    console.log("[v0] Total worksheets:", worksheets.length)

    worksheets.forEach((ws) => {
      const option = document.createElement("option")
      option.value = ws.name
      option.textContent = ws.name
      worksheetSelect.appendChild(option)
    })

    worksheetSelect.addEventListener("change", async (e) => {
      const selectedWorksheetName = e.target.value
      if (selectedWorksheetName) {
        await loadDataSourcesFromWorksheet(selectedWorksheetName)
      } else {
        const dataSourceSelect = document.getElementById("dataSource")
        dataSourceSelect.innerHTML = '<option value="">Primero selecciona una hoja...</option>'
      }
    })

    const dataSourceSelect = document.getElementById("dataSource")
    dataSourceSelect.addEventListener("change", async (e) => {
      const selectedDataSourceName = e.target.value
      if (selectedDataSourceName) {
        const selectedWorksheetName = document.getElementById("worksheet").value
        await loadColumnsFromDataSource(selectedDataSourceName, selectedWorksheetName)
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

async function loadDataSourcesFromWorksheet(worksheetName) {
  try {
    console.log("[v0] Cargando fuentes de datos del worksheet:", worksheetName)

    const worksheet = worksheets.find((ws) => ws.name === worksheetName)
    if (!worksheet) {
      throw new Error("Worksheet no encontrado")
    }

    const dataSources = await worksheet.getDataSourcesAsync()
    const dataSourceSelect = document.getElementById("dataSource")

    dataSourceSelect.innerHTML = '<option value="">Seleccionar...</option>'

    console.log("[v0] Fuentes de datos en el worksheet:", dataSources.length)

    dataSources.forEach((ds) => {
      const option = document.createElement("option")
      option.value = ds.name
      option.textContent = ds.name
      dataSourceSelect.appendChild(option)
      console.log("[v0] Fuente de datos:", ds.name)
    })

    if (dataSources.length === 0) {
      const option = document.createElement("option")
      option.value = ""
      option.textContent = "No hay fuentes de datos en esta hoja"
      dataSourceSelect.appendChild(option)
    }
  } catch (error) {
    console.error("[v0] Error cargando fuentes de datos del worksheet:", error)
    alert("Error al cargar fuentes de datos: " + error.message)
  }
}

async function loadColumnsFromDataSource(dataSourceName, worksheetName) {
  try {
    console.log("[v0] Cargando columnas de:", dataSourceName)

    const worksheet = worksheets.find((ws) => ws.name === worksheetName)
    if (!worksheet) {
      throw new Error("Worksheet no encontrado")
    }

    const dataSources = await worksheet.getDataSourcesAsync()
    const selectedDataSource = dataSources.find((ds) => ds.name === dataSourceName)

    if (!selectedDataSource) {
      console.error("[v0] Fuente de datos no encontrada en el worksheet")
      return
    }

    const logicalTables = await selectedDataSource.getLogicalTablesAsync()
    if (logicalTables.length === 0) {
      console.warn("[v0] No hay tablas lógicas en la fuente de datos")
      return
    }

    const logicalTableId = logicalTables[0].id
    const dataTable = await selectedDataSource.getLogicalTableDataAsync(logicalTableId, {
      maxRows: 1,
    })

    availableColumns = dataTable.columns.map((c) => c.fieldName)

    console.log("[v0] Columnas cargadas:", availableColumns)

    updateColumnDropdowns()
  } catch (error) {
    console.error("[v0] Error cargando columnas:", error)
    try {
      console.log("[v0] Intentando método alternativo para obtener columnas...")

      const worksheet = worksheets.find((ws) => ws.name === worksheetName)
      const summaryData = await worksheet.getSummaryDataAsync()
      availableColumns = summaryData.columns.map((c) => c.fieldName)
      console.log("[v0] Columnas cargadas con método alternativo:", availableColumns)
      updateColumnDropdowns()
    } catch (altError) {
      console.error("[v0] Error con método alternativo:", altError)
      alert(
        "Error al cargar columnas: " +
          error.message +
          ". Verifica que la fuente de datos tenga datos y esté siendo usada en el worksheet.",
      )
    }
  }
}

function updateColumnDropdowns() {
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

function loadCurrentConfiguration() {
  const settings = tableau.extensions.settings.getAll()

  if (settings.worksheetName) {
    document.getElementById("worksheet").value = settings.worksheetName

    if (settings.parameterMappings) {
      mappings = JSON.parse(settings.parameterMappings)
      console.log("[v0] Mapeos cargados desde settings:", mappings)
    }

    const worksheetSelect = document.getElementById("worksheet")
    const event = new Event("change")
    worksheetSelect.dispatchEvent(event)

    setTimeout(async () => {
      if (settings.dataSourceName) {
        document.getElementById("dataSource").value = settings.dataSourceName
        document.getElementById("usernameColumn").value = settings.usernameColumn || "username"

        document.getElementById("hideAfterLoad").checked = settings.hideAfterLoad === "true"
        document.getElementById("errorMessage").value = settings.errorMessage || ""

        await loadColumnsFromDataSource(settings.dataSourceName, settings.worksheetName)

        setTimeout(() => {
          const container = document.getElementById("mappingsContainer")
          container.innerHTML = ""

          console.log("[v0] Renderizando mapeos guardados:", mappings)

          if (mappings.length > 0) {
            mappings.forEach((mapping) => addMapping(mapping))
          } else {
            addMapping()
          }
        }, 300)
      }
    }, 500)
  } else {
    addMapping()
  }
}

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

function removeMapping(button) {
  const mappingDiv = button.closest(".mapping-section")
  const index = Array.from(mappingDiv.parentNode.children).indexOf(mappingDiv)

  mappings.splice(index, 1)
  mappingDiv.remove()
}

function saveConfiguration() {
  const worksheetName = document.getElementById("worksheet").value
  const dataSourceName = document.getElementById("dataSource").value
  const usernameColumn = document.getElementById("usernameColumn").value
  const hideAfterLoad = document.getElementById("hideAfterLoad").checked
  const errorMessage = document.getElementById("errorMessage").value.trim()

  console.log("[v0] Guardando configuración...")
  console.log("[v0] Worksheet:", worksheetName)
  console.log("[v0] Fuente de datos:", dataSourceName)
  console.log("[v0] Columna username:", usernameColumn)
  console.log("[v0] Ocultar después de cargar:", hideAfterLoad)
  console.log("[v0] Mensaje de error:", errorMessage)

  if (!worksheetName) {
    alert("Debes seleccionar un worksheet")
    return
  }

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

  const parentTableau = window.parent.tableau

  parentTableau.extensions.settings.set("worksheetName", worksheetName)
  parentTableau.extensions.settings.set("dataSourceName", dataSourceName)
  parentTableau.extensions.settings.set("usernameColumn", usernameColumn)
  parentTableau.extensions.settings.set("parameterMappings", JSON.stringify(mappings))
  parentTableau.extensions.settings.set("hideAfterLoad", hideAfterLoad.toString())
  parentTableau.extensions.settings.set("errorMessage", errorMessage)
  parentTableau.extensions.settings.set("configured", "true")

  console.log("[v0] Todas las configuraciones establecidas, guardando...")

  parentTableau.extensions.settings
    .saveAsync()
    .then(() => {
      console.log("[v0] Configuración guardada exitosamente en el workbook")
      tableau.extensions.ui.closeDialog("saved")
    })
    .catch((error) => {
      console.error("[v0] Error guardando configuración:", error)
      alert("Error al guardar: " + error.message)
    })
}

function closeDialog() {
  tableau.extensions.ui.closeDialog("cancelled")
}

function importFromCSV() {
  const csvInput = document.getElementById("csvInput").value.trim()

  if (!csvInput) {
    alert("Por favor ingresa un texto CSV para importar")
    return
  }

  const values = csvInput
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v)

  if (values.length === 0 || values.length % 2 !== 0) {
    alert("Formato CSV inválido. Debes ingresar pares de valores: Columna,Parametro,Columna,Parametro,...")
    return
  }

  const container = document.getElementById("mappingsContainer")
  container.innerHTML = ""
  mappings = []

  for (let i = 0; i < values.length; i += 2) {
    const columnName = values[i]
    const parameterName = values[i + 1]

    if (availableColumns.length > 0 && !availableColumns.includes(columnName)) {
      console.warn(`[v0] Columna "${columnName}" no encontrada en la fuente de datos`)
    }

    const paramExists = availableParameters.find((p) => p.name === parameterName)
    if (!paramExists) {
      console.warn(`[v0] Parámetro "${parameterName}" no encontrado en el dashboard`)
    }

    addMapping({ columnName, parameterName })
  }

  console.log(`[v0] Importados ${mappings.length} mapeos desde CSV`)
  alert(`Se importaron ${mappings.length} mapeos correctamente`)

  document.getElementById("csvInput").value = ""
}
