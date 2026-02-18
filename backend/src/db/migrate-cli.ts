import path from 'path'
import { umzug } from './migrate'
import { db } from '.'
import { logger } from '../utils/logger'

async function main() {
  const [command, migrationArg] = process.argv.slice(2)
  const migrationName = migrationArg?.split(path.sep).pop()

  try {
    switch (command) {
      case 'up':
        logger.info('Running all pending migrations...')
        await umzug.up()
        break

      case 'down':
        if (migrationName) {
          logger.info(`Reverting down to ${migrationName}`)
          await umzug.down({ to: migrationName })
        }
        break

      case 'pending':
        const pending = await umzug.pending()
        logger.info(
          { pending: pending.map((m) => m.name) },
          'Pending migrations',
        )
        break

      default:
        console.log(`
Usage:
  bun migrate up
  bun migrate down
  bun migrate down <migration-file>
  bun migrate pending
        `)
        break
    }

    logger.info('Migration command completed')
  } catch (err) {
    logger.error({ err }, 'Migration command failed')
    process.exit(1)
  } finally {
    db.close()
  }
}

main()
