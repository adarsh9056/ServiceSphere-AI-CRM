const { gql } = require('apollo-server-express');

module.exports = gql`
  enum UserRole {
    ADMIN
    SALESPERSON
    MANAGER
  }

  enum LeadStatus {
    NEW
    CONTACTED
    QUALIFIED
    PROPOSAL_SENT
    NEGOTIATION
    CLOSED_WON
    CLOSED_LOST
  }

  enum DealStage {
    NEW
    CONTACTED
    QUALIFIED
    PROPOSAL
    NEGOTIATION
    WON
    LOST
  }

  enum Sentiment {
    POSITIVE
    NEUTRAL
    NEGATIVE
  }

  enum TaskStatus {
    OPEN
    DONE
    CANCELLED
  }

  enum TaskPriority {
    LOW
    NORMAL
    HIGH
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: UserRole!
  }

  type Account {
    id: ID!
    name: String!
    website: String
    industry: String
    phone: String
    owner: User
  }

  type Contact {
    id: ID!
    firstName: String!
    lastName: String!
    email: String
    phone: String
    title: String
    isPrimary: Boolean!
  }

  type Task {
    id: ID!
    title: String!
    description: String
    dueAt: String
    status: TaskStatus!
    priority: TaskPriority!
    assignedTo: User
    createdBy: User
    createdAt: String!
    updatedAt: String!
  }

  type Note {
    id: ID!
    body: String!
    createdBy: User
    createdAt: String!
    updatedAt: String!
  }

  type DealStageHistoryEntry {
    id: ID!
    fromStage: DealStage
    toStage: DealStage!
    changedBy: User
    reason: String
    createdAt: String!
  }

  type Lead {
    id: ID!
    name: String!
    company: String
    email: String
    phone: String
    status: LeadStatus!
    source: String
    score: Int!
    sentiment: Sentiment
    openedEmail: Boolean!
    repliedEmail: Boolean!
    companySize: Int
    notes: String
    assignedTo: User
    account: Account
    contacts: [Contact!]!
    createdAt: String!
    updatedAt: String!
    deals: [Deal!]!
    tasks: [Task!]!
    leadNotes: [Note!]!
  }

  type Deal {
    id: ID!
    stage: DealStage!
    value: String
    expectedCloseDate: String
    lastStageChangeAt: String!
    lead: Lead!
    owner: User
    stageHistory: [DealStageHistoryEntry!]!
    createdAt: String!
    updatedAt: String!
  }

  type Activity {
    id: ID!
    type: String!
    description: String!
    createdAt: String!
    lead: Lead
    user: User
  }

  type EmailRecord {
    id: ID!
    direction: String!
    subject: String
    body: String
    fromAddress: String
    toAddress: String
    threadKey: String
    inReplyTo: String
    createdAt: String!
  }

  type WhatsappRecord {
    id: ID!
    body: String!
    direction: String!
    phone: String!
    createdAt: String!
  }

  type TimelineEvent {
    id: ID!
    kind: String!
    at: String!
    title: String!
    subtitle: String
    meta: String
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type DashboardStats {
    totalLeads: Int!
    openDeals: Int!
    revenueWon: String!
    conversionRate: Float!
    topSalesperson: User
    leadsByStatus: [StatusCount!]!
    dealsTrend: [TrendPoint!]!
  }

  type StatusCount {
    status: String!
    count: Int!
  }

  type TrendPoint {
    label: String!
    value: Int!
  }

  type AutomationRule {
    id: ID!
    name: String!
    trigger: String!
    action: String!
    config: String
    enabled: Boolean!
  }

  type AutomationExecutionEntry {
    id: ID!
    triggerKey: String!
    status: String!
    attempts: Int!
    lastError: String
    createdAt: String!
    rule: AutomationRule
  }

  type AIReplyResult {
    body: String!
  }

  type SentimentResult {
    sentiment: Sentiment!
  }

  type InboundSyncResult {
    skipped: Boolean!
    imported: Int!
    error: String
  }

  type Query {
    me: User
    getLeads(search: String, status: LeadStatus): [Lead!]!
    getLead(id: ID!): Lead
    getLeadTimeline(leadId: ID!): [TimelineEvent!]!
    getDeals: [Deal!]!
    getDeal(id: ID!): Deal
    getDashboardStats: DashboardStats!
    getActivities(limit: Int): [Activity!]!
    getEmailsForLead(leadId: ID!): [EmailRecord!]!
    getWhatsappForLead(leadId: ID!): [WhatsappRecord!]!
    getAutomationRules: [AutomationRule!]!
    getAutomationExecutions(limit: Int): [AutomationExecutionEntry!]!
  }

  type Mutation {
    signup(name: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    requestPasswordReset(email: String!): Boolean!
    resetPassword(token: String!, password: String!): Boolean!

    createLead(
      name: String!
      company: String
      email: String
      phone: String
      status: LeadStatus
      source: String
      notes: String
      companySize: Int
      assignedToId: ID
      accountId: ID
    ): Lead!
    updateLead(
      id: ID!
      name: String
      company: String
      email: String
      phone: String
      status: LeadStatus
      source: String
      notes: String
      score: Int
      assignedToId: ID
      accountId: ID
    ): Lead!

    createDeal(leadId: ID!, stage: DealStage, value: String, expectedCloseDate: String): Deal!
    moveDeal(id: ID!, stage: DealStage!, reason: String): Deal!

    sendEmail(leadId: ID!, to: String!, subject: String!, body: String!): EmailRecord!
    generateAIReply(leadId: ID!): AIReplyResult!
    analyzeEmailSentiment(leadId: ID!, emailBody: String!): SentimentResult!

    createActivity(leadId: ID, type: String!, description: String!): Activity!

    createTask(
      leadId: ID
      dealId: ID
      title: String!
      description: String
      dueAt: String
      priority: TaskPriority
      assignedToId: ID
    ): Task!
    updateTaskStatus(id: ID!, status: TaskStatus!): Task!

    createNote(leadId: ID, dealId: ID, body: String!): Note!

    upsertAutomationRule(
      id: ID
      name: String!
      trigger: String!
      action: String!
      config: String
      enabled: Boolean
    ): AutomationRule!

    runInboundEmailSync: InboundSyncResult!
  }
`;
