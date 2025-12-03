# Configuración de GitHub Pages

Este archivo contiene instrucciones para activar GitHub Pages en tu repositorio.

## Pasos para Activar GitHub Pages:

1. Ve a tu repositorio: https://github.com/canidoac/UserAcces
2. Haz clic en **Settings** (Configuración)
3. En el menú lateral izquierdo, busca **Pages**
4. En **Source** (Fuente), selecciona **Deploy from a branch**
5. En **Branch**, selecciona **main** y carpeta **/ (root)**
6. Haz clic en **Save**

## Verificación:

Después de unos minutos (2-5 min), tu extensión estará disponible en:
\`\`\`
https://canidoac.github.io/UserAcces/
\`\`\`

Para usar la extensión en Tableau Desktop:
1. Arrastra un objeto "Extension" al dashboard
2. Selecciona "Access Local Extensions" 
3. Usa esta URL en el manifest:
\`\`\`
https://canidoac.github.io/UserAcces/UserAcces.trex
\`\`\`

## Archivos Importantes:

- `.nojekyll` - Indica a GitHub Pages que no use Jekyll (necesario para servir todos los archivos)
- `UserAcces.trex` - Manifest de la extensión
- `index.html` - Página principal de la extensión
- `config.html` - Página de configuración
- `auto-params.js` - Lógica principal
- `config.js` - Lógica de configuración

## Troubleshooting:

Si obtienes error 404:
1. Verifica que GitHub Pages esté activado
2. Espera 5 minutos después de hacer push
3. Verifica que el branch sea "main"
4. Limpia el caché del navegador (Ctrl+Shift+R)

Si la extensión no carga en Tableau:
1. Verifica que la URL del manifest sea correcta
2. Asegúrate de tener permisos para ejecutar extensiones
3. Revisa los logs en la consola de desarrollador
