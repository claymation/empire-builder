import "./style.css"

import paper from 'paper'

const gridLineColor = new paper.Color("lightblue")

function drawGridLine(x1: number, y1: number, x2: number, y2: number, color: paper.Color) {
    const start = new paper.Point(x1, y1)
    const end = new paper.Point(x2, y2)

    var path = new paper.Path()
    path.strokeColor = color

    path.moveTo(start)
    path.lineTo(end)
}

function drawGrid(width: number, height: number) {
    for (let x = 25; x < width; x += 50) {
        drawGridLine(x, 0, x, height, gridLineColor)
    }

    for (let y = 25; y < height; y += 50) {
        drawGridLine(0, y, width, y, gridLineColor)
    }
}

let canvas = <HTMLCanvasElement>document.getElementById("canvas")

paper.setup(canvas)

paper.view.onResize = function() {
    drawGrid(window.innerWidth, window.innerHeight)
}

drawGrid(window.innerWidth, window.innerHeight)
