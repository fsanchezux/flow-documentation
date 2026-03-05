# Flow-Docs

Visor local de documentación para archivos `SKILL.md`. Convierte tus skills en documentación navegable con búsqueda, syntax highlight y hot-reload.

## Inicio rápido

```bash
npm install
npm start
# → http://localhost:3000
```

Para desarrollo con auto-restart del servidor:
```bash
npm run dev
```

Al abrir la app por primera vez, selecciona la carpeta de tu ordenador que contiene tu documentación. La ruta queda guardada en `skilldocs.config.json` y se restaura automáticamente en cada sesión.

## Selección de carpeta

Flow-Docs no tiene una carpeta fija — al iniciar sin configuración previa, la pantalla de bienvenida muestra un botón **"Seleccionar carpeta"** que abre el explorador nativo de Windows.

También puedes cambiar la carpeta en cualquier momento desde el botón **"Cambiar"** en la parte superior del sidebar.

> `skilldocs.config.json` está en `.gitignore` porque contiene rutas locales de tu máquina.

## Estructura de skills

Cada skill es una carpeta con un `SKILL.md` como punto de entrada:

```
tu-carpeta/
├── mi-skill/
│   ├── SKILL.md          ← punto de entrada (obligatorio)
│   ├── examples/
│   │   └── ejemplo.vb
│   └── patterns/
│       └── patron.md
└── otro-skill/
    └── SKILL.md
```

Los links relativos en el markdown (`[ver ejemplo](examples/foo.vb)`) se renderizan automáticamente como bloques de código embebidos.

## Features

- 📁 Selector de carpeta nativo de Windows — sin configuración manual
- 💾 Carpeta persistente entre sesiones (`skilldocs.config.json`)
- 📖 Render markdown con syntax highlight (VB.NET, SQL, HTML, JS...)
- 🔍 Búsqueda en todos los skills (`Ctrl+K`) con filtros por tipo (`--doc`, `--sql`, `--vb`...)
- 📋 Botón de copiar en cada bloque de código
- ⚡ Hot-reload: banner de aviso al editar cualquier archivo
- 🗂️ TOC (tabla de contenidos) automático por skill
- 🔗 URLs con hash para compartir secciones (`#skill-name/section-id`)
- 🌲 Árbol de archivos por skill en el sidebar

## Configuración de puerto

Por defecto el servidor arranca en el puerto `3000`. Para cambiarlo:

```bash
PORT=4000 npm start
```
