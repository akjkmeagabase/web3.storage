#!/usr/bin/env node
import path from 'path'
import dotenv from 'dotenv'
import sade from 'sade'
import { fileURLToPath } from 'url'
import got from 'got'
import execa from 'execa'
import net from 'net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prog = sade('api')

dotenv.config({
  path: path.join(__dirname, '../.env.local')
})

prog
  .command('cluster')
  .describe('Run ipfs cluster')
  .option('--start', 'Start docker container', false)
  .option('--stop', 'Stop docker container', false)
  .option('--project', 'Project name', 'ipfs-cluster')
  .option('--clean', 'Clean all dockers artifacts', false)
  .action(clusterCmd)
  .command('heartbeat', 'Ping opsgenie heartbeat')
  .option('--token', 'Opsgenie Token')
  .option('--name', 'Heartbeat Name')
  .action(heartbeatCmd)

/**
 * @param {Object} opts
 * @param {string} opts.project
 * @param {boolean} [opts.start]
 * @param {boolean} [opts.stop]
 * @param {boolean} [opts.clean]
 */
export async function clusterCmd ({ project, start, stop, clean }) {
  const composePath = path.join(__dirname, '../docker/cluster/docker-compose.yml')

  if (!project) {
    throw new Error('A project must be provided as parameter')
  }

  if (start) {
    if (await isPortReachable(9094)) {
      throw new Error('Cluster is already running. Please check if you have any docker project or cluster deamon already running.')
    }
    await execa('docker-compose', [
      '--file',
      composePath,
      '--project-name',
      project,
      'up',
      '--detach'
    ])
  }

  if (stop) {
    await execa('docker-compose', [
      '--file',
      composePath,
      '--project-name',
      project,
      'stop'
    ])
  }
  if (clean) {
    await execa('docker-compose', [
      '--file',
      composePath,
      '--project-name',
      project,
      'down',
      '--volumes',
      '--rmi',
      'local',
      '--remove-orphans'
    ])
  }
}

prog.parse(process.argv)

/**
 * @param {number} port
 */
export default async function isPortReachable (
  port,
  { host = 'localhost', timeout = 1000 } = {}
) {
  if (typeof host !== 'string') {
    throw new TypeError('Specify a `host`')
  }

  const promise = new Promise((resolve, reject) => {
    const socket = new net.Socket()

    const onError = (err) => {
      socket.destroy()
      reject(err)
    }

    socket.setTimeout(timeout)
    socket.once('error', onError)
    socket.once('timeout', onError)

    socket.connect(port, host, () => {
      socket.end()
      resolve(undefined)
    })
  })

  try {
    await promise
    return true
  } catch {
    return false
  }
}

async function heartbeatCmd (opts) {
  try {
    await got(`https://api.opsgenie.com/v2/heartbeats/${opts.name}/ping`, {
      headers: {
        Authorization: `GenieKey ${opts.token}`
      }
    })
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
