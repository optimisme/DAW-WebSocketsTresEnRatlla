const express = require('express')
const shadowsObj = require('./utilsShadows.js')
const webSockets = require('./utilsWebSockets.js')

/*
    WebSockets server, example of messages:

    From client to server:
        - Choosen cell          { "type": "movement", "cell", 0 }

    From server to client:
        - Opponent              { "type": "opponent", "name": "001" }
        - Movement              { "type": "movement", "board": [] }
        - YourTurn              { "type": "yourTurn" }
        - Game Over             { "type": "gameOver", "winner": "001", "board": [] }
 */

var ws = new webSockets()
let shadows = new shadowsObj()

// Jugadors i partides
let matches = []

// Start HTTP server
const app = express()
const port = process.env.PORT || 8888

// Publish static files from 'public' folder
app.use(express.static('public'))

// Activate HTTP server
const httpServer = app.listen(port, appListen)
async function appListen () {
  await shadows.init('./public/index.html', './public/shadows')
  console.log(`Listening for HTTP queries on: http://localhost:${port}`)
}

// Close connections when process is killed
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
function shutDown() {
  console.log('Received kill signal, shutting down gracefully');
  httpServer.close()
  ws.end()
  process.exit(0);
}

// WebSockets
ws.init(httpServer, port)

ws.onConnection = (socket, id) => {

  console.log("WebSocket client connected: " + id)
  idMatch = -1
  playersReady = false
  
  if (matches.length == 0) {
    // Si no hi ha partides, en creem una de nova
    idMatch = 0
    matches.push({
      playerX: id, 
      playerO: "", 
      board: ["", "", "", "", "", "", "", "", ""],
      nextTurn: "X"
    })
  } else {
    // Si hi ha partides, mirem si n'hi ha alguna en espera de jugador
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].playerX == "") {
        idMatch = i
        matches[i].playerX = id
        playersReady = true
        break
      } else if (matches[i].playerO == "") {
        idMatch = i
        matches[i].playerO = id
        playersReady = true
        break
      }
    }
    // Si hi ha partides, però totes ocupades creem una de nova
    if (idMatch == -1) {
      idMatch = matches.length
      matches.push({ 
        playerX: id, 
        playerO: "", 
        board: ["", "", "", "", "", "", "", "", ""],
        nextTurn: "X"
      })
    }
  }

  // Enviem l'identificador de client socket
  socket.send(JSON.stringify({
    type: "socketId",
    value: id
  }))

  // Enviem l'estat inicial de la partida
  socket.send(JSON.stringify({
    type: "initMatch",
    value: matches[idMatch]
  }))

  // Si ja hi ha dos jugadors
  if (playersReady) {
    let idOpponent = ""
    if (matches[idMatch].playerX == id) {
      idOpponent = matches[idMatch].playerO
    } else {
      idOpponent = matches[idMatch].playerX
    }

    let wsOpponent = ws.getClientById(idOpponent)
    if (wsOpponent != null) {
      // Informem al oponent que ja té rival
      wsOpponent.send(JSON.stringify({
        type: "initMatch",
        value: matches[idMatch]
      }))

      // Informem al oponent que toca jugar
      wsOpponent.send(JSON.stringify({
        type: "gameRound",
        value: matches[idMatch]
      }))

      // Informem al player que toca jugar
      socket.send(JSON.stringify({
        type: "gameRound",
        value: matches[idMatch]
      }))
    }
  }
}

ws.onMessage = (socket, id, msg) => {
  let obj = JSON.parse(msg)
  let idMatch = -1

  // Busquem la partida a la que pertany el client
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].playerX == id || matches[i].playerO == id) {
      idMatch = i
      break
    }
  }

  // Processar el missatge rebut
  if (idMatch != -1) {
    switch (obj.type) {
    case "cellOver":
      // Si revem la posició del mouse de qui està jugant, l'enviem al rival
      let playerTurn = matches[idMatch].nextTurn
      let idSend = matches[idMatch].playerX
      if (playerTurn == "X") idSend = matches[idMatch].playerO

      let wsSend = ws.getClientById(idSend)
      if (wsSend != null) {
        wsSend.send(JSON.stringify({
          type: "opponentOver",
          value: obj.value
        }))
      }
      break
    }
  }
}

ws.onClose = (socket, id) => {
  console.log("WebSocket client disconnected: " + id)

  // Busquem la partida a la que pertany el client
  idMatch = -1
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].playerX == id || matches[i].playerO == id) {
      idMatch = i
      break
    }
  }
  // Informem al rival que s'ha desconnectat
  if (idMatch != -1) {
    if (matches[idMatch].playerX == "" && matches[idMatch].playerO == "") {
      // Esborrar la partida per falta de jugadors
      matches.splice(idMatch, 1)
    } else {
      
      // Esborrar el jugador de la partida
      let rival = ""
      if (matches[idMatch].playerX == id) {
        matches[idMatch].playerX = ""
        rival = matches[idMatch].playerO
      } else {
        matches[idMatch].playerO = ""
        rival = matches[idMatch].playerX
      }

      // Informar al rival que s'ha desconnectat
      let rivalSocket = ws.getClientById(rival)
      if (rivalSocket != null) {
        rivalSocket.send(JSON.stringify({
          type: "opponentDisconnected"
        }))
      }
    }
  }
}

// Configurar la direcció '/index-dev.html' per retornar
// la pàgina que descarrega tots els shadows (desenvolupament)
app.get('/index-dev.html', getIndexDev)
async function getIndexDev (req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.send(shadows.getIndexDev())
}

// Configurar la direcció '/shadows.js' per retornar
// tot el codi de les shadows en un sol arxiu
app.get('/shadows.js', getShadows)
async function getShadows (req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(shadows.getShadows())
}