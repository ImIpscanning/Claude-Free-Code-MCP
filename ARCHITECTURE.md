# Arquitectura técnica

```text
Claude Desktop (cuota Free o de pago)
      │ stdio JSON-RPC / MCP
      ▼
src/mcp.js ─────── createTools (src/tools.js)
                         │
         ┌───────────────┼─────────────────┐
         ▼               ▼                 ▼
  archivos/búsqueda   Git/subprocesos   planes/checkpoints
  src/paths.js        src/process.js    src/storage.js
         │               │                 │
         └───────────────┼─────────────────┘
                         ▼
              src/approvals.js
                         ▲
                    HTTP loopback
                         ▲
                 Panel web local
              src/dashboard.js
```

El servidor MCP es un proceso Node.js iniciado por Claude Desktop. Usa transporte de **JSON por línea** a través de stdin/stdout. El código implementa operaciones básicas MCP (`initialize`, `ping`, `tools/list`, `tools/call`) sin dependencias externas. La negociación contempla las versiones 2025-03-26, 2025-06-18, 2025-11-25 y 2026-07-28, con un subconjunto de herramientas sin recursos ni sampling. No garantiza todas las extensiones de cada versión del protocolo.

Las herramientas están declaradas con esquemas de entrada JSON y annotations de lectura/destrucción. Los errores de ejecución de herramientas se devuelven en un `CallToolResult` con `isError: true`. Los logs solo se envían a stderr.

Cada instancia tiene un único root de proyecto. Notas, snapshots, permisos de comandos y auditoría se almacenan en `~/.claude-free-code-mcp/workspaces/<hash del root>/`. El secreto del panel se almacena fuera del workspace. El panel no depende de bibliotecas ni CDN.

El panel usa el puerto 8765 por defecto, con puerto libre automático si está ocupado. `node src/dashboard-link.js` descubre los paneles disponibles y emite enlaces privados.

La aprobación es de tiempo limitado y solo puede venir de una petición autenticada al panel local; una herramienta MCP no puede autocertificar su aprobación. Una autorización persistente se asocia al nombre de acción, parámetros específicos y workspace; las autorizaciones pueden revocarse.

Las escrituras guardan los bytes previos si existían, de forma que se pueda recuperar la versión anterior sin reescribir el historial Git. El hash del archivo actual debe coincidir con el estado posterior a la edición, evitando restaurar encima de modificaciones más recientes.

Se limita la memoria de herramientas mediante cuotas de bytes, profundidad y cantidad de archivos. La búsqueda de texto es **literal** (no índice semántico ni expresiones regulares arbitrarias) para evitar costos inesperados.

El servidor no es un agente autónomo. Claude decide cuándo solicitar herramientas; el MCP no genera respuestas ni consume tokens API de forma directa. Los checkpoints son manuales, no programación en segundo plano.