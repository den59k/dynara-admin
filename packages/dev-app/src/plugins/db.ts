import { createData } from 'marci-orm'
import * as schema from './schema'

export const db = createData(schema)

