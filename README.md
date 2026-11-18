# Claude Free Code MCP 1.0.0

**Un servidor MCP local para programar con Claude Desktop** mediante herramientas de archivos, búsqueda, Git/GitHub, terminal aprobada, snapshots, planes y checkpoints. Implementado con **Node.js 20+ sin dependencias npm externas**. Incluye panel web local con autenticación y permisos granulares.

> **No es Claude Code oficial.** No convierte la cuota gratuita de Claude Chat en créditos de Claude Code, no amplía límites y no puede obligar a Claude a continuar trabajando una vez agotada la cuota. En una versión de Claude Desktop con extensiones locales disponibles, puedes usar estas herramientas mientras tu plan permita invocaciones MCP.

## Instalación rápida (Windows)

### A. Extensión `.mcpb` (más fácil)

1. Abre Claude Desktop actualizado y ve a **Settings > Desktop app > Extensions > Manage** (la ruta exacta puede cambiar entre versiones).
2. Elige **Install Extension...** y selecciona `claude-free-code-local.mcpb`.
3. Selecciona una **carpeta concreta de proyecto** cuando se te solicite. Evita elegir `C:\`, todo tu perfil de usuario o carpetas con secretos.
4. Activa la extensión y abre una conversación de Claude Desktop.
5. Prueba: *«Usa `workspace_info` y `project_tree` para analizar mi proyecto»*.

No hace falta una API key para el MCP. La extensión contiene solo JavaScript y `manifest.json`; Claude Desktop normalmente incluye un runtime Node.js.

**No se ha probado todavía instalándolo dentro de la aplicación Claude Desktop real.** Si tu versión no reconoce el paquete o el plan no permite invocar las herramientas, usa el método B y revisa los registros de Claude.

### B. Configuración manual (útil para depurar)

1. Descomprime `claude-free-code-mcp.zip`.
2. Instala Node.js 20 o posterior si no lo tienes. Abre PowerShell y comprueba `node --version`.
3. Abre `%APPDATA%\Claude\claude_desktop_config.json` y combina este bloque con tus MCP existentes:

```json
{
  "mcpServers": {
    "claude-free-code": {
      "command": "node",
      "args": ["C:\\RUTA\\claude-free-code-mcp\\src\\index.js", "C:\\Proyectos\\MiProyecto"]
    }
  }
}
```

4. Sustituye ambas rutas por las rutas reales de tu ordenador; conserva los `\\` de JSON.
5. Reinicia Claude Desktop y revisa la lista de herramientas MCP.

El último argumento es la carpeta a la que el MCP tendrá acceso. También se admite la variable `MCP_PROJECT_ROOT`. Para cada carpeta puedes crear una entrada MCP independiente. **Nunca edites el JSON eliminando las entradas de otros MCP.**

### C. Abrir el panel de permisos

1. Con Claude Desktop y el MCP **ya iniciados**, abre CMD/PowerShell dentro de la carpeta del proyecto descargado.
2. Ejecuta `npm run panel` (o `node src/dashboard-link.js`).
3. Abre la URL privada que se imprime, con forma `http://127.0.0.1:8765/?token=...`.
4. Cuando Claude solicite `run_command`, `run_task`, borrar un archivo, mover algo, hacer un commit o abrir un PR, **revisa los detalles en el panel** y aprueba o rechaza.
5. Si quieres guardar una excepción, usa **Confiar siempre**; queda ligada al comando y argumentos concretos. Puedes revocarla en ese mismo panel.

El panel se limita a `127.0.0.1`, usa token de acceso persistido en tu perfil y comprueba el origen de las solicitudes de escritura. El enlace es privado: **no lo compartas ni lo subas a GitHub**. Si tienes varios proyectos activos, `npm run panel` lista sus paneles.

## Herramientas disponibles (40)

| Grupo | Herramientas | Función |
|---|---|---|
| Contexto | `workspace_info`, `project_tree`, `glob_files`, `search_code`, `read_file`, `read_files` | Explorar archivos y localizar código |
| Edición | `preview_replace`, `write_file`, `replace_exact`, `edit_lines`, `make_directory`, `move_path`, `delete_path` | Cambios controlados y revisión |
| Deshacer | `list_snapshots`, `restore_snapshot` | Recuperar versión anterior si no hubo cambios posteriores |
| Git | `git_status`, `git_diff`, `git_log`, `git_branches`, `git_stage`, `git_commit`, `git_remote`, `git_create_branch` | Repositorios locales |
| GitHub | `github_repo_view`, `github_pr_list`, `github_issue_list`, `github_pr_create` | Usa la herramienta opcional `gh` autenticada |
| Ejecución | `command_catalog`, `run_task`, `run_command` | Ejecutar proyectos y comprobar resultados con aprobación |
| Continuidad | `plan_create`, `plan_update`, `plan_get`, `project_notes_read`, `project_notes_write`, `checkpoint_save`, `checkpoint_list`, `checkpoint_read`, `resume_context` | Planes, notas y reanudación manual |
| Seguridad | `audit_recent` | Historial de operaciones |

**La cifra exacta de herramientas la anuncia el servidor al iniciarse.**

### Comandos

- Tareas de `run_task`: `test`, `build`, `lint`, `format`, `typecheck`, `git-status`, `git-diff`.
- `run_command`: argumentos separados, sin shell implícita; ejecutables permitidos incluyen `node`, `npm`, `git`, `gh`, `python`, `java`, `javac`, `go`, `cargo`, `dotnet`, `powershell`, `pwsh`, `cmd` y otros del catálogo.
- `npm` y otros compiladores deben estar **instalados y accesibles en PATH** para ejecutar tareas; el runtime Node incluido en Claude Desktop no garantiza que tu equipo tenga npm/Java/Git/Python.
- Un comando puede modificar archivos fuera del workspace si se lo autorizas; el panel de permisos **no es un sandbox del sistema operativo**. No apruebes comandos que no entiendas.
- Cada ejecución tiene duración máxima de 180 segundos, salida limitada y registro de auditoría. Las aprobaciones pendientes caducan a los 120 segundos.

### GitHub (opcional)

Instala [GitHub CLI](https://cli.github.com/) y autentícate en tu terminal con `gh auth login`. Las herramientas de GitHub usan **tu sesión local**: el MCP no solicita ni guarda tokens GitHub. También puedes usar Git sin `gh`.

## Para retomar tareas al alcanzar el límite Free

Pide en Claude Desktop:

> Usa `plan_create` para organizar el trabajo. Ejecuta una tarea a la vez, consulta los archivos necesarios, verifica el resultado con `run_task` y guarda un `checkpoint_save` con cambios, errores y próximos pasos antes de detenerte.

Cuando vuelvas a tener mensajes gratuitos, abre una conversación nueva y escribe:

> Usa `resume_context`, lee el último checkpoint, comprueba el estado de Git y continúa desde los pasos que faltan. No repitas tareas finalizadas.

El progreso se guarda localmente en `%USERPROFILE%\.claude-free-code-mcp\workspaces\...`; sigue siendo necesario que **tú reanudes la conversación**. No hay ejecución independiente mientras Claude no tiene cuota.

## Diseño y seguridad

- Rutas relativas dentro de una carpeta asignada. Bloquea rutas absolutas, escapes con `..` y enlaces simbólicos que intentan saltarse la restricción.
- No permite editar archivos internos `.git` a través de herramientas generales: usa los comandos Git explícitos.
- No permite borrar directorios no vacíos. Borrados de archivos y restauraciones requieren aprobación.
- Cada modificación de archivo conserva un snapshot anterior y opcionalmente verifica `expectedSha256` para detectar ediciones concurrentes.
- El servidor MCP no imprime datos de protocolo por `stderr` ni logs por `stdout`: la salida estándar queda reservada a mensajes JSON-RPC.
- El historial y las notas se guardan en el equipo, no en servicios externos. **Los contenidos que Claude lee o redacta sí pasan por el chat de Claude**, sujeto a sus términos y configuración.
- Operaciones de npm, compiladores, PowerShell y herramientas de GitHub pueden ejecutar código, realizar conexiones de red o modificar recursos; la aprobación humana no elimina ese riesgo.
- Los snapshots son una ayuda, no sustituyen **Git**, copias de seguridad ni revisión manual.

Ver [SECURITY.md](SECURITY.md) para límites y advertencias. Ver [ARCHITECTURE.md](ARCHITECTURE.md) para detalles técnicos.

## Desarrollo y pruebas

```powershell
node --version
npm test
npm run check
node src/index.js "C:\Proyectos\MiProyecto"
```

**Pruebas en este paquete:** pruebas unitarias e integración JSON-RPC sobre un entorno Linux con Node 22. **Pendiente:** prueba real en Claude Desktop sobre Windows y verificación mediante el CLI oficial `mcpb` (no disponible en el entorno de construcción).

Si el MCP no aparece, revisa la consola de registros de extensiones en Claude Desktop. Si la herramienta queda pendiente, abre el panel para aprobar. Si la tarea falla, revisa los mensajes de `stderr` y el `audit.jsonl` de ese proyecto.

Licencia MIT. Código JavaScript local, sin SDK ni API de terceros como dependencia obligatoria.