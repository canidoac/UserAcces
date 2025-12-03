let availableParameters = []
let mappings = []
const tableau = window.tableau // Declare the tableau variable

// Inicializar diálogo de configuración
tableau.extensions.initializeDialogAsync().then(() => {
  loadAvailableData()
  loadCurrentConfiguration()
})

// Cargar datos disponibles (fuentes de datos y parámetros)
async function loadAvailableData() {
  try {
    const dashboard = tableau.extensions.dashboardContent.dashboard

    // Cargar fuentes de datos
    const dataSources = await dashboard.worksheets[0].getDataSourcesAsync()
    const dataSourceSelect = document.getElementById("dataSource")

    dataSources.forEach((ds) => {
      const option = document.createElement("option")
      option.value = ds.name
      option.textContent = ds.name
      dataSourceSelect.appendChild(option)
    })

    // Cargar parámetros disponibles
    availableParameters = await dashboard.getParametersAsync()
  } catch (error) {
    console.error("[v0] Error cargando datos:", error)
  }
}

// Cargar configuración actual
function loadCurrentConfiguration() {
  const settings = tableau.extensions.settings.getAll()

  if (settings.dataSourceName) {
    document.getElementById("dataSource").value = settings.dataSourceName
    document.getElementById("usernameColumn").value = settings.usernameColumn || "username"

    mappings = JSON.parse(settings.parameterMappings || "[]")
    mappings.forEach((mapping) => addMapping(mapping))
  } else {
    // Agregar un mapeo vacío por defecto
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
        <input type="text" class="column-name" placeholder="Ej: rol, region, area" 
               value="${existingMapping ? existingMapping.columnName : ""}">
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

  if (!dataSourceName) {
    alert("Debes seleccionar una fuente de datos")
    return
  }

  // Recopilar mapeos
  const mappingDivs = document.querySelectorAll(".mapping-section")
  mappings = []

  mappingDivs.forEach((div) => {
    const columnName = div.querySelector(".column-name").value
    const parameterName = div.querySelector(".parameter-name").value

    if (columnName && parameterName) {
      mappings.push({ columnName, parameterName })
    }
  })

  if (mappings.length === 0) {
    alert("Debes agregar al menos un mapeo de columna a parámetro")
    return
  }

  // Guardar en settings
  tableau.extensions.settings.set("dataSourceName", dataSourceName)
  tableau.extensions.settings.set("usernameColumn", usernameColumn)
  tableau.extensions.settings.set("parameterMappings", JSON.stringify(mappings))

  tableau.extensions.settings.saveAsync().then(() => {
    tableau.extensions.ui.closeDialog("saved")
  })
}

// Cerrar diálogo
function closeDialog() {
  tableau.extensions.ui.closeDialog("cancelled")
}
