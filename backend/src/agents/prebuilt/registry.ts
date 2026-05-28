import type { PrebuiltType } from '@prisma/client'
import { hrTemplate } from './templates/hrTemplate.js'
import { socialMediaManagerTemplate } from './templates/socialMediaManagerTemplate.js'
import { softwareEngineerTemplate } from './templates/softwareEngineerTemplate.js'
import { uiUxDesignerTemplate } from './templates/uiUxDesignerTemplate.js'

export type AgentTemplate = {
  name: string
  prebuiltType: PrebuiltType
  description: string
  toolkits: string[]
  systemPromptTemplate: string
}

export const PREBUILT_AGENTS: Record<PrebuiltType, AgentTemplate> = {
  HR: hrTemplate,
  SOCIAL_MEDIA_MANAGER: socialMediaManagerTemplate,
  SOFTWARE_ENGINEER: softwareEngineerTemplate,
  UI_UX_DESIGNER: uiUxDesignerTemplate,
}

export type OrgContext = {
  companyName: string
  industry: string
  companySize: string
  adminRole: string
  goals: string
  tone: string
}

export function fillTemplate(template: string, ctx: OrgContext): string {
  return template
    .replace(/{{companyName}}/g, ctx.companyName)
    .replace(/{{industry}}/g, ctx.industry)
    .replace(/{{companySize}}/g, ctx.companySize)
    .replace(/{{adminRole}}/g, ctx.adminRole)
    .replace(/{{goals}}/g, ctx.goals)
    .replace(/{{tone}}/g, ctx.tone)
}
