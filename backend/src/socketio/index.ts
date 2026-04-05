import { Server as Engine } from '@socket.io/bun-engine'
import { Server } from 'socket.io'

import { isDevelopment } from '../utils/isEnv'
import { Sync } from './sync'

const io = new Server()
const engine = new Engine({
  cors: {
    origin: isDevelopment() ? ['http://localhost:5173'] : [],
  },
})

io.bind(engine)

new Sync(io)

export { engine, io }
