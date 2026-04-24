# Guía de Formato y Diseño - Datix ERP

Este documento establece las reglas visuales y arquitectónicas obligatorias para el desarrollo de nuevos módulos en el sistema Datix. El objetivo es mantener una experiencia de usuario (UX) coherente, profesional y de "sobriedad elegante".

## 1. Arquitectura de Navegación: "Document-Centric"
Todos los módulos administrativos deben abandonar el uso de ventanas emergentes (modales) para operaciones CRUD y adoptar un flujo de documento a pantalla completa:

- **Vista de Lista (LIST):** Tablas o Grillas de tarjetas con barra de búsqueda y botón "Nuevo" en el encabezado.
- **Vista de Formulario (FORM):** Al editar o crear, el contenido debe reemplazar la pantalla completa, permitiendo foco total en el ingreso de datos.

## 2. Paleta de Colores y Sombras
- **Color Primario:** `#4C3073` (Púrpura Datix). Usado para botones principales, títulos destacados e iconos activos.
- **Fondo de Pantalla:** `#f8f9fa` (Gris tenue). Proporciona un lienzo limpio para los contenedores blancos.
- **Contenedores:** Fondo blanco puro (`bg-white`), bordes gris claro (`border-gray-200`).
- **Profundidad:** Evitar sombras pesadas. Usar `shadow-sm` o simplemente bordes definidos para separar elementos. **No usar degradados.**

## 3. Patrón de Encabezado (Header)
El encabezado del formulario es la pieza clave de la identidad visual y debe seguir esta estructura exacta:

- **Izquierda superior:** Breadcrumbs (Migas de pan) en `text-[11px]` font-bold, gris, indicando la ruta (ej: CATÁLOGO / MEDICAMENTO).
- **Izquierda inferior:** Botón "Cancelar y Volver" con borde sobrio (`border-gray-300`), icono `ArrowLeft` y texto en mayúsculas.
- **Derecha:** Botón "Guardar" sólido con fondo `#4C3073`, texto en blanco y mayúsculas.

## 4. Diseño de Formularios
- **Secciones:** Agrupar campos relacionados en cajas blancas (`bg-white`) con bordes (`border-gray-200`).
- **Títulos de Sección:** Usar una franja superior tenue (`bg-gray-50/50`) con etiquetas en `text-[11px]` font-black y mayúsculas.
- **Labels de Campo:** Mayúsculas, `text-[11px]`, color gris (`text-gray-500`).
- **Inputs:** Bordes simples, sin sombras internas agresivas. Fuente `text-sm`.

## 5. Microinteracciones y Animaciones
- **Sobriedad:** El sistema debe sentirse rápido e instantáneo.
- **Prohibido:** No usar `animate-pulse` en estados de carga (preferir esqueletos grises estáticos o spinners sutiles).
- **Transiciones:** Evitar `animate-in` o `slide-in` en módulos administrativos pesados. El cambio de vista debe ser directo o con un `fade-in` muy rápido (máximo 150ms).

## 6. Iconografía
- Utilizar exclusivamente **Lucide React**.
- Mantener un tamaño consistente (20px para iconos de sección, 16px para botones).
- Color de iconos auxiliares: `text-gray-400`.

---
> **Regla de Oro:** Si un diseño se ve "divertido" o "muy animado", no es Datix. El diseño debe verse como una herramienta de trabajo de alta gama: sobria, eficiente y elegante.
