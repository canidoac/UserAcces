# Auto Parámetros - Extensión Tableau

Extensión que alimenta parámetros automáticamente al abrir un dashboard de Tableau, optimizando la carga cuando tienes fuentes de datos con muchos registros (ej: 100k usuarios).

## Características

- **Carga automática**: Se ejecuta apenas abres el dashboard
- **Optimizada**: Filtra datos por username antes de cargar (solo 1 registro)
- **Configurable**: Define qué columnas alimentan qué parámetros
- **Visual feedback**: Muestra el progreso y tiempo de carga
- **Sin backend**: No requiere APIs externas ni servidores

## Instalación

### Opción 1: GitHub Pages (Recomendado para Producción)

La extensión está alojada en:
```
https://canidoac.github.io/UserAcces/
```

**Para usar en Tableau Desktop:**

1. En Tableau Desktop, abre tu dashboard
2. Arrastra un objeto "Extension" al dashboard
3. Haz clic en "Access Local Extensions"
4. Pega esta URL o navega al archivo:
```
https://canidoac.github.io/UserAcces/UserAcces.trex
```

**Activar GitHub Pages** (si aún no está activo):
1. Ve a Settings > Pages en tu repositorio
2. En Source, selecciona branch "main" y carpeta "/ (root)"
3. Guarda y espera 2-5 minutos

Ver instrucciones detalladas en: [INSTRUCCIONES_GITHUB_PAGES.md](INSTRUCCIONES_GITHUB_PAGES.md)

### Opción 2: Desarrollo Local

```bash
# Opción 1: Python (recomendado)
python -m http.server 8000

# Opción 2: Node.js
npx http-server -p 8000

# Opción 3: PHP
php -S localhost:8000
```

### 3. Agregar extensión a Tableau

1. Abre tu dashboard en Tableau Desktop
2. Arrastra un objeto "Extensión" al dashboard
3. Selecciona "Acceder a extensión local"
4. Navega y selecciona el archivo `manifest.trex`

### 4. Configurar la extensión

1. Haz clic en "Configurar Fuente de Datos"
2. Selecciona la fuente de datos que contiene los usuarios
3. Ingresa el nombre de la columna de username (ej: "username", "email")
4. Agrega mapeos: qué columna alimentará qué parámetro
   - **Ejemplo**: Columna "rol" → Parámetro "Rol Usuario"
   - **Ejemplo**: Columna "region" → Parámetro "Region"
5. Guarda la configuración

## Cómo Funciona

### Flujo de ejecución

```
1. Dashboard se abre
   ↓
2. Extensión obtiene username automáticamente
   ↓
3. Filtra la fuente de datos POR USERNAME (1 solo registro)
   ↓
4. Lee los valores de las columnas configuradas
   ↓
5. Alimenta los parámetros correspondientes
   ↓
6. ¡Listo! Dashboard cargado con parámetros personalizados
```

### Ventajas vs. Método Anterior

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Registros cargados | 100,000 | 1 |
| Tiempo de carga | 10-30 seg | 2-5 seg |
| Filtrado | En Tableau | En la extensión |
| Automatización | Manual | Automática |

## Requisitos Previos

### En tu Dashboard de Tableau:

1. **Fuente de datos de usuarios** con:
   - Columna de username (puede llamarse: username, user_name, email, etc.)
   - Columnas con los valores para los parámetros (ej: rol, region, area)
   - **IMPORTANTE**: Debe estar filtrada para que cada usuario vea solo su registro

2. **Parámetros creados** en Tableau que quieras alimentar automáticamente

### Ejemplo de estructura de datos:

| username | rol | region | area |
|----------|-----|--------|------|
| juan.perez | Admin | LATAM | Ventas |
| maria.lopez | Usuario | EMEA | Marketing |

## Configuración de Producción

Cuando estés listo para pasar a producción:

1. Sube los archivos a un servidor web (GitHub Pages, Vercel, tu servidor)
2. Actualiza la URL en `manifest.trex`:

```xml
<source-location>
  <url>https://tu-dominio.com/tableau-extension/index.html</url>
</source-location>
```

3. Publica el dashboard en Tableau Server/Online con la extensión configurada

## Troubleshooting

### Error 404 al cargar la extensión

- Verifica que GitHub Pages esté activado en Settings > Pages
- Espera 2-5 minutos después de activarlo o hacer push
- Usa la URL completa: `https://canidoac.github.io/UserAcces/UserAcces.trex`
- Limpia el caché del navegador (Ctrl+Shift+R)

### La extensión no encuentra datos del usuario

- Verifica que la columna de username esté correctamente escrita
- Asegúrate que el filtro en Tableau esté aplicado a la fuente de datos
- Revisa que el username del usuario coincida con los datos

### Los parámetros no se actualizan

- Verifica que los nombres de los parámetros en la configuración coincidan exactamente
- Revisa los logs en la extensión para ver mensajes de error
- Asegúrate que los nombres de las columnas sean correctos

### "No se encontró la fuente de datos"

- Verifica que el nombre de la fuente de datos en la configuración sea exacto
- Algunas fuentes tienen nombres con espacios o caracteres especiales

## Estructura del Proyecto

```
UserAcces/
├── index.html          # Interfaz principal con logs y progreso
├── auto-params.js      # Lógica de carga automática de parámetros
├── config.html         # Interfaz de configuración de mapeos
├── config.js           # Lógica de configuración
├── UserAcces.trex      # Manifest de Tableau (apunta a GitHub Pages)
├── .nojekyll           # Necesario para GitHub Pages
└── README.md
```

## Soporte

Si tienes problemas:
1. Revisa los logs en la extensión (se muestran en pantalla)
2. Abre la consola del navegador (F12) para ver logs detallados con el prefijo `[v0]`
3. Verifica que todos los nombres (columnas, parámetros, fuente de datos) sean exactos
