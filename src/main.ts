import "./style.css"

import paper from 'paper'

const canvas = <HTMLCanvasElement>document.getElementById("canvas")

paper.setup(canvas)

function drawGridLine(x1: number, y1: number, x2: number, y2: number, color: paper.Color) {
    const start = new paper.Point(x1, y1)
    const end = new paper.Point(x2, y2)

    var path = new paper.Path()
    path.strokeColor = color

    path.moveTo(start)
    path.lineTo(end)
}

const gridLineColor = new paper.Color("lightblue")

for (let x = 25; x < 300; x += 50) {
    drawGridLine(x, 0, x, 150, gridLineColor)
}

for (let y = 25; y < 150; y += 50) {
    drawGridLine(0, y, 300, y, gridLineColor)
}
