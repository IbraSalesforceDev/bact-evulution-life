# Génesis — La aparición y evolución de la vida 🧬

Un juego/simulación tipo **autómata celular** sobre cómo, a partir de elementos
químicos, surgen moléculas, y de ahí la vida unicelular, pluricelular y compleja.

La superficie del planeta es una rejilla de **100×100 celdas** proyectada sobre
una **esfera 3D** que puedes **girar** (arrastrando) y **acercar/alejar** (rueda
del ratón). Al iniciar la partida, cada celda tiene pequeñas probabilidades de
combinar elementos esenciales (CHON) y, con el paso de los millones de años, ir
ascendiendo de etapa. **La vida abre camino**: una celda con vecinas vivas
evoluciona mucho más fácilmente, así que la vida se expande en oleadas. Eventos
como **meteoritos y volcanes** arrasan regiones enteras, pero las siembran de
nuevos materiales que facilitan un nuevo comienzo.

Cada partida genera un **planeta distinto** en el universo, con condiciones
aleatorias (abundancia de elementos, aptitud para la vida y bombardeo cósmico)
que lo hacen más fácil o más difícil. El 3D usa [Three.js](https://threejs.org),
incluido en `vendor/` para que funcione sin conexión.

## Cómo jugar

Al usar módulos de JavaScript, hay que servirlo por HTTP (no vale abrir el
archivo con doble clic). No requiere instalación ni build:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

Para compartirlo con más gente, lo más cómodo es desplegarlo gratis en un
servicio estático (Vercel, Netlify, GitHub Pages…) y pasar el enlace.

### Controles
- **▶ Iniciar / ⏸ Pausar** — arranca o detiene la evolución (también con la barra espaciadora).
- **↻ Reiniciar** — vuelve a la sopa primordial.
- **Velocidad** — millones de años simulados por segundo.
- **Frecuencia de cataclismos** — cada cuánto ocurren meteoritos/volcanes.
- **☄ Meteorito / 🌋 Volcán** — provoca un cataclismo manual.
- **Click en el tablero** — lanza un meteorito en ese punto exacto.

## Etapas evolutivas

| Color | Etapa |
|-------|-------|
| Azul oscuro | Estéril (roca / océano) |
| Azul | Elementos esenciales (CHON) |
| Verde azulado | Moléculas orgánicas |
| Verde | Vida unicelular |
| Verde lima | Vida pluricelular |
| Naranja | Vida compleja |

## Cómo funciona la simulación

Cada celda guarda una concentración de **material** (elementos químicos) y su
**etapa** evolutiva. En cada tick (= 1 millón de años):

1. El material se difunde entre celdas vecinas y el entorno genera más lentamente.
2. La vida consume material para mantenerse; si se agota, la celda **decae**.
3. Una celda puede **ascender** de etapa con cierta probabilidad, mucho mayor si
   tiene vecinas vivas. El salto a la primera vida (abiogénesis) es el más raro.
4. Ocasionalmente ocurre un **cataclismo** que borra la vida de una zona pero la
   deja rica en materiales.

Todos los parámetros (probabilidades, costes, difusión...) están como constantes
al principio de [`game.js`](game.js) para que sea fácil experimentar.

## Estructura

- `index.html` — interfaz.
- `styles.css` — estilos.
- `game.js` — simulación y render (canvas).
