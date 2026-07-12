import * as net from 'net'

export async function findFreePort(startPort: number = 3000): Promise<number> {
  let port = startPort
  while (true) {
    const isFree = await new Promise<boolean>((resolve) => {
      const server = net.createServer()
      server.once('error', () => {
        resolve(false)
      })
      server.once('listening', () => {
        server.close(() => {
          resolve(true)
        })
      })
      server.listen(port, '127.0.0.1')
    })
    if (isFree) {
      return port
    }
    port++
  }
}
