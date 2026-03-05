# Flow-Docs

Visor local de documentación para archivos `SKILL.md`. Convierte tus skills en documentación navegable con búsqueda, syntax highlight, editor integrado y hot-reload.

---

## Descargar e instalar (app de escritorio)

### 1. Ve a la página de releases

👉 **[github.com/fsanchezux/flow-documentation/releases](https://github.com/fsanchezux/flow-documentation/releases)**

### 2. Descarga el instalador

En la última release encontrarás dos opciones:

| Archivo | Descripción |
|---|---|
| `Flow-Docs Setup x.x.x.exe` | Instalador — instala la app en tu sistema (recomendado) |
| `Flow-Docs x.x.x.exe` | Portable — ejecuta sin instalar, llévalo en un USB |

### 3. Instala y abre

- Ejecuta el `.exe` descargado
- Si Windows muestra un aviso de SmartScreen, haz clic en **"Más información" → "Ejecutar de todas formas"**
- Al abrir la app, selecciona la carpeta con tu documentación

> La carpeta seleccionada queda guardada automáticamente y se restaura en cada sesión.

---

## Features

- 📁 Selector de carpeta nativo — sin configuración manual
- 💾 Carpeta persistente entre sesiones
- 📖 Render markdown con syntax highlight (VB.NET, SQL, HTML, JS...)
- 🔍 Búsqueda en todos los skills (`Ctrl+K`) con filtros por tipo (`--doc`, `--sql`, `--vb`...)
- ✏️ Editor integrado — edita y guarda cualquier archivo sin salir de la app
- 🖱️ Clic derecho en cualquier archivo → abrir en el Explorador de Windows
- 📋 Copiar bloques de código con un clic
- ⚡ Hot-reload: banner de aviso al editar archivos externamente
- 🗂️ TOC (tabla de contenidos) automático
- 🔗 URLs con hash para compartir secciones (`#skill-name/section-id`)
- 🌲 Árbol de archivos por skill en el sidebar

---

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

---

## Ejecutar en modo servidor (desarrollo)

Si prefieres usarlo como servidor web local en lugar de la app de escritorio:

```bash
npm install
npm start
# → http://localhost:3000
```

Para desarrollo con auto-restart:
```bash
npm run dev
```

Para lanzar la app Electron directamente desde el código fuente:
```bash
npm run electron
```
