const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const fs = require('fs-extra')
const uuid = require('node-uuid')
const moment = require('moment')

const app = express()

app.use(express.static(`${__dirname}/dist`))

const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

const chat = fs.readJsonSync('./chat.json')

const saveChat = () => {}

const processUser = (message, client) => {
  const user = chat.users.find(u => u.name === message.user)
  switch (message.action) {
    case 'create':
      if (!user) {
        chat.users.push({
          name: message.user,
          avatar: message.avatar,
          client: client.id
        })
        saveChat()
        return JSON.stringify({
          ...message,
          channels: chat.channels,
          users: chat.users
        })
      } else {
        return JSON.stringify({
          type: 'error',
          message: 'User already exists'
        })
      }
    case 'destroy': {
      chat.users = chat.users.filter(u => u.name !== message.name)
      saveChat()
      return JSON.stringify({
        type: 'user',
        action: 'destroy',
        name: message.user
      })
    }
  }
}

const processChannel = (message) => {
  const channel = chat.channels.find(c => c.name === message.name)
  switch (message.action) {
    case 'create':
      if (!channel) {
        chat.channels.push({
          name: message.name,
          owner: message.owner
        })
        saveChat()
        return JSON.stringify({
          ...message,
          channels: chat.channels,
          users: chat.users
        })
      } else {
        return 'Channel Already Exists'
      }
    case 'destroy':
      if (channel.user === message.user) {
        chat.channels = chat.channels.filter(c => c.name !== message.name)
        saveChat()
        return JSON.stringify({
          ...message,
          channels: chat.channels,
          users: chat.users
        })
      } else {
        return 'This is not your channel!'
      }
  }
}

const processMessage = (message) => {
  return JSON.stringify({
    ...message,
    time: moment().format('h:mm A'),
    id: `m-${uuid.v4()}`
  })
}

const processDM = (message) => {
  return chat.users.filter(u => (u.name === message.dm.them || u.name === message.dm.me))
}

wss.on('connection', (ws) => {
  const clients = wss.clients
  ws.id = uuid.v4()
  ws.on('message', (m) => {
    const message = JSON.parse(m)
    switch (message.type) {
      case 'channel':
        const channel = processChannel(message)
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(channel)
          }
        })
        break
      case 'user':
        const user = processUser(message, ws)
        if (JSON.parse(user).type === 'error') {
          if (ws.readyState === 1) {
            ws.send(user)
          }
        } else {
          wss.clients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(user)
            }
          })
        }
        break
      case 'message':
        const msg = processMessage(message)
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(msg)
          }
        })
        break
      case 'dm': 
        const clients = processDM(message)
        clients.forEach(c => {
          wss.clients.forEach(client => {
            if (client.id === c.client) {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  ...message,
                  time: moment().format('h:mm A'),
                  id: `dm-${uuid.v4()}`
                }))
              }
            }
          })
        })
    }
  })
  ws.on('close', () => {
    const user = chat.users.find(u => u.client === ws.id)
    chat.users = chat.users.filter(u => u.client !== ws.id)
    clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'user',
          action: 'destroy',
          users: chat.users
        }))
      }
    })
  })
})

server.listen(process.env.PORT || 8080, () => {
    console.log(`Server started on port ${server.address().port} :)`)
})