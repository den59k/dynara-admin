import { createData } from '../../../backend/src/db/db'
import * as schema from './schema'

export const db = createData(schema)

