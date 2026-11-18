# Modelo de seguridad

Este MCP es para desarrollo local con una **carpeta elegida por el usuario**. No promete aislamiento al nivel de un contenedor o de una VM.

## Protecciones implementadas

- Las herramientas de lectura/escritura usan rutas relativas. Se rechazan rutas absolutas, travesías fuera de la carpeta y componentes que son enlaces simbólicos.
- Límite de tamaño para lectura y escritura, límite de archivos y resultados de búsqueda, límites de tiempo/salida en subprocesos.
- Los archivos internos `.git` no pueden editarse con `write_file` ni `replace_exact`.
- Escritura atómica de archivos, SHA-256 opcional para no sobrescribir cambios más nuevos y snapshots para revertir.
- Eliminaciones, renombrados, restauraciones y operaciones de Git/terminal que cambian el entorno requieren confirmación en un panel local.
- El panel solo escucha en loopback (`127.0.0.1`), exige token y comprueba el encabezado `Origin` para peticiones POST.
- Sin descarga ni instalación automática de paquetes en el propio MCP. No se incluye ningún comando para escanear hosts o atacar sistemas externos.

## Riesgos y limitaciones

- **No hay sandbox OS**: un comando aprobado puede tener todos los permisos del usuario del sistema e ignorar la carpeta de trabajo. Nunca autorices comandos que no entiendas.
- Las dependencias y scripts de los proyectos pueden realizar acciones inesperadas. Comprueba `package.json`, `pom.xml`, `build.gradle`, etc., antes de ejecutar tareas.
- Las comprobaciones de rutas no impiden por completo carreras del sistema de archivos (TOCTOU) si otro proceso modifica simultáneamente carpetas o enlaces.
- El dashboard usa un secreto local; cualquier proceso con acceso al perfil del usuario que obtenga ese secreto podría interactuar con el panel.
- La cuota Free de Claude y el soporte de extensiones son restricciones de Anthropic, fuera del control del servidor.
- Archivos leídos por el asistente pueden incluir información privada. Evita seleccionar directorios con credenciales, secretos o documentos personales.
- `gh` GitHub CLI y herramientas de construcción pueden acceder a servicios externos. Los resultados y códigos proporcionados al modelo siguen la política de privacidad de Claude.
- No hay defensa total contra instrucciones maliciosas presentes en repositorios o archivos; revisa especialmente los comandos solicitados por la IA.

## Guía de operación

Usa el workspace mínimo necesario. Haz commits frecuentes. Usa aprobaciones de una sola vez cuando puedas. Revoca autorizaciones guardadas al cambiar de proyecto o cuando dudes de un comando. No publiques los enlaces con token del panel. No expongas el puerto local mediante proxy o túnel. No ejecutes el MCP como administrador salvo necesidad excepcional y comprensible.