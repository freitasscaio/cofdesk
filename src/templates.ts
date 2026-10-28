import { newBlock } from './store'
import type { Block } from './types'

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  cover: string
  blocks: () => Block[]
}

const todo = (html: string, checked = false): Block => ({ ...newBlock('todo', html), checked })

export const TEMPLATES: Template[] = [
  {
    id: 'meeting', name: 'Notas de reunião', description: 'Pauta, decisões e próximos passos',
    icon: 'lucide:Users:blue', cover: 'linear-gradient(120deg,#e0c3fc,#8ec5fc)',
    blocks: () => [
      newBlock('callout', 'Data, participantes e objetivo da reunião.'),
      newBlock('h2', 'Pauta'), newBlock('bullet', ''),
      newBlock('h2', 'Decisões'), newBlock('bullet', ''),
      newBlock('h2', 'Próximos passos'), todo(''),
    ],
  },
  {
    id: 'todo', name: 'Lista de tarefas', description: 'Organize o que precisa ser feito hoje',
    icon: 'lucide:CircleCheckBig:green', cover: 'linear-gradient(120deg,#84fab0,#8fd3f4)',
    blocks: () => [
      newBlock('h2', 'Hoje'), todo(''),
      newBlock('h2', 'Esta semana'), todo(''),
      newBlock('h2', 'Algum dia'), todo(''),
    ],
  },
  {
    id: 'journal', name: 'Diário', description: 'Reflexões, gratidão e metas do dia',
    icon: 'lucide:PenLine:orange', cover: 'linear-gradient(120deg,#f6d365,#fda085)',
    blocks: () => [
      newBlock('h3', 'Como estou me sentindo'), newBlock('text', ''),
      newBlock('h3', 'Sou grato por'), newBlock('numbered', ''),
      newBlock('h3', 'Meta de hoje'), todo(''),
    ],
  },
  {
    id: 'project', name: 'Plano de projeto', description: 'Objetivo, escopo, marcos e riscos',
    icon: 'lucide:Rocket:purple', cover: 'linear-gradient(120deg,#a18cd1,#fbc2eb)',
    blocks: () => [
      newBlock('h2', 'Objetivo'), newBlock('text', ''),
      newBlock('h2', 'Escopo'), newBlock('bullet', ''),
      newBlock('h2', 'Marcos'), todo(''),
      { ...newBlock('toggle', 'Riscos'), body: '', open: false },
    ],
  },
  {
    id: 'wiki', name: 'Wiki da equipe', description: 'Central de documentos e processos',
    icon: 'lucide:BookOpen:brown', cover: 'linear-gradient(120deg,#fccb90,#d57eeb)',
    blocks: () => [
      newBlock('callout', 'Bem-vindo à wiki. Tudo o que a equipe precisa saber fica aqui.'),
      newBlock('h2', 'Comece por aqui'), newBlock('bullet', 'Como trabalhamos'), newBlock('bullet', 'Ferramentas'),
      newBlock('h2', 'Processos'), newBlock('bullet', ''),
    ],
  },
]
