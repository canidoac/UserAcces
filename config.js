let availableParameters = []
let mappings = []
let tableau = null // Declare the tableau variable

function waitForTableau() {
  return new Promise((resolve, reject) => {
    if (window.tableau) {
      resolve(window.tableau)
    } else {
      let attempts = 0
      const checkInterval = setInterval(() => {
        attempts++
        if (window.tableau) {
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
    tableau = tableauResult // Assign the tableau variable
    console.log("[v0] Tableau API cargada, inicializando diálogo...")
    return tableau.extensions.initializeDialogAsync()
  })
  .then(() => {
    console.log("[v0] Diálogo de configuración inicializado")
    return loadAvailableData()
  })
  .then(() => {
    loadCurrentConfiguration()
  })
  .catch((error) => {
    console.error("[v0] Error en inicialización:", error)
    alert("Error al inicializar configuración: " + error.message)
  })

// Cargar datos disponibles (fuentes de datos y parámetros)
async function loadAvailableData() {
  try {
    console.log("[v0] Cargando datos disponibles...")
    const dashboard = window.tableau.extensions.dashboardContent.dashboard

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
          // Evitar duplicados
          if (!allDataSources.find((existing) => existing.name === ds.name)) {
            allDataSources.push(ds)
          }
        })
      } catch (err) {
        console.error("[v0] Error obteniendo fuentes de datos del worksheet:", err)
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

    // Cargar parámetros disponibles
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

  console.log("[v0] Guardando configuración...")
  console.log("[v0] Fuente de datos:", dataSourceName)
  console.log("[v0] Columna username:", usernameColumn)

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

  console.log("[v0] Mapeos:", mappings)

  if (mappings.length === 0) {
    alert("Debes agregar al menos un mapeo de columna a parámetro")
    return
  }

  // Guardar en settings
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
