export type BlockType =
  | 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'todo' | 'toggle'
  | 'quote' | 'callout' | 'divider' | 'code' | 'image' | 'page' | 'database'
  | 'columns' | 'table' | 'embed' | 'bookmark'

export interface LinkMeta { title?: string; description?: string; image?: string; icon?: string; site?: string }

export interface Block {
  id: string
  type: BlockType
  html: string
  checked?: boolean
  open?: boolean
  body?: string
  url?: string
  pageId?: string
  icon?: string
  /** nesting depth: a block's children are the blocks right after it with a greater indent */
  indent?: number
  /** columns: each column is its own block list */
  cols?: Block[][]
  /** table: cell html by row, then column */
  rows?: string[][]
  header?: boolean
  /** embed: what the empty embed asks for */
  embed?: 'any' | 'video' | 'map'
  /** bookmark preview, fetched by the server */
  meta?: LinkMeta
}

export type PropType =
  | 'text' | 'number' | 'select' | 'multi_select' | 'status' | 'date'
  | 'checkbox' | 'url' | 'email' | 'phone' | 'created_time'
  | 'relation' | 'rollup' | 'formula'

export type RollupFn =
  | 'show' | 'count' | 'count_values' | 'count_unique' | 'sum' | 'avg' | 'min' | 'max' | 'range'
  | 'earliest' | 'latest' | 'percent_checked' | 'percent_empty'

export interface SelectOption { id: string; name: string; color: string }

export interface Property {
  id: string
  name: string
  type: PropType
  options?: SelectOption[]
  /** relation: rows of another database; `twoWay` is the matching property over there */
  relation?: { dbId: string; twoWay?: string }
  /** rollup: aggregates `target` (a property id, or '__title') of the rows linked through `relation` */
  rollup?: { relation: string; target: string; fn: RollupFn }
  /** formula expression, e.g. prop("Horas") * 2 */
  formula?: string
}

export type ViewType = 'table' | 'board' | 'calendar' | 'chart' | 'gallery' | 'list' | 'timeline' | 'dashboard'
export type ChartType = 'bar' | 'horizontal_bar' | 'line' | 'area' | 'pie' | 'donut'
export type Agg = 'count' | 'sum' | 'avg' | 'min' | 'max'
export type FilterOp = 'contains' | 'equals' | 'not_empty' | 'empty' | 'checked' | 'unchecked' | 'gt' | 'lt'

export interface View {
  id: string
  name: string
  type: ViewType
  groupBy?: string
  dateProp?: string
  chartType?: ChartType
  xProp?: string
  yProp?: string
  agg?: Agg
  sort?: { prop: string; dir: 'asc' | 'desc' }
  filter?: { prop: string; op: FilterOp; value: string }
  /** timeline: optional end date (start is `dateProp`) and zoom */
  endProp?: string
  zoom?: 'day' | 'week' | 'month'
  /** dashboard tiles */
  widgets?: Widget[]
}

/** One dashboard tile: a chart or a single number, from this or any other database. */
export interface Widget {
  id: string
  title: string
  kind: 'chart' | 'number'
  source?: string
  chartType?: ChartType
  xProp?: string
  yProp?: string
  agg?: Agg
  span?: 1 | 2
}

export interface Page {
  id: string
  title: string
  icon?: string
  cover?: string
  parentId: string | null
  kind: 'page' | 'database'
  blocks: Block[]
  props: Record<string, any>
  schema?: Property[]
  views?: View[]
  favorite?: boolean
  trashed?: boolean
  fullWidth?: boolean
  inline?: boolean
  createdAt: number
  updatedAt: number
  order: number
}
