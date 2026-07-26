import envPaths from 'env-paths'

const paths = envPaths('opencad-agent', { suffix: '' })

export const DATA_DIR = paths.data
export const CACHE_DIR = paths.cache
export const LOGS_DIR = paths.log
export const CONFIG_DIR = paths.config
