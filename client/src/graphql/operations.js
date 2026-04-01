import { gql } from '@apollo/client'

export const ME = gql`
  query Me {
    me {
      id
      name
      email
      role
    }
  }
`

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        name
        email
        role
      }
    }
  }
`

export const LOGOUT = gql`
  mutation Logout {
    logout
  }
`

export const SIGNUP = gql`
  mutation Signup($name: String!, $email: String!, $password: String!) {
    signup(name: $name, email: $email, password: $password) {
      token
      user {
        id
        name
        email
        role
      }
    }
  }
`

export const REQUEST_RESET = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`

export const RESET_PASSWORD = gql`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`

export const GET_LEADS = gql`
  query GetLeads($search: String, $status: LeadStatus) {
    getLeads(search: $search, status: $status) {
      id
      name
      company
      email
      phone
      status
      score
      source
      notes
      assignedTo {
        id
        name
      }
      updatedAt
    }
  }
`

export const CREATE_LEAD = gql`
  mutation CreateLead(
    $name: String!
    $company: String
    $email: String
    $phone: String
    $source: String
    $notes: String
    $companySize: Int
  ) {
    createLead(
      name: $name
      company: $company
      email: $email
      phone: $phone
      source: $source
      notes: $notes
      companySize: $companySize
    ) {
      id
    }
  }
`

export const GET_DEALS = gql`
  query GetDeals {
    getDeals {
      id
      stage
      value
      lastStageChangeAt
      lead {
        id
        name
        company
        email
      }
      owner {
        name
      }
    }
  }
`

export const MOVE_DEAL = gql`
  mutation MoveDeal($id: ID!, $stage: DealStage!) {
    moveDeal(id: $id, stage: $stage) {
      id
      stage
    }
  }
`

export const DASHBOARD_STATS = gql`
  query DashboardStats {
    getDashboardStats {
      totalLeads
      openDeals
      revenueWon
      conversionRate
      topSalesperson {
        id
        name
      }
      leadsByStatus {
        status
        count
      }
      dealsTrend {
        label
        value
      }
    }
  }
`

export const GET_ACTIVITIES = gql`
  query GetActivities {
    getActivities(limit: 40) {
      id
      type
      description
      createdAt
      lead {
        name
      }
      user {
        name
      }
    }
  }
`

export const SEND_EMAIL = gql`
  mutation SendEmail($leadId: ID!, $to: String!, $subject: String!, $body: String!) {
    sendEmail(leadId: $leadId, to: $to, subject: $subject, body: $body) {
      id
    }
  }
`

export const GENERATE_AI_REPLY = gql`
  mutation GenerateAIReply($leadId: ID!) {
    generateAIReply(leadId: $leadId) {
      body
    }
  }
`

export const AUTOMATION_RULES = gql`
  query AutomationRules {
    getAutomationRules {
      id
      name
      trigger
      action
      config
      enabled
    }
  }
`

export const AUTOMATION_EXECUTIONS = gql`
  query AutomationExecutions($limit: Int) {
    getAutomationExecutions(limit: $limit) {
      id
      triggerKey
      status
      attempts
      lastError
      createdAt
      rule {
        id
        name
      }
    }
  }
`

export const GET_LEAD_DETAIL = gql`
  query GetLeadDetail($id: ID!) {
    getLead(id: $id) {
      id
      name
      company
      email
      phone
      status
      score
      sentiment
      notes
      account {
        id
        name
        industry
      }
      contacts {
        id
        firstName
        lastName
        email
        title
      }
      deals {
        id
        stage
        value
        stageHistory {
          id
          fromStage
          toStage
          reason
          createdAt
          changedBy {
            name
          }
        }
      }
      tasks {
        id
        title
        status
        dueAt
      }
      leadNotes {
        id
        body
        createdAt
        createdBy {
          name
        }
      }
      emails {
        id
        direction
        subject
        body
        fromAddress
        toAddress
        createdAt
      }
      attachments {
        id
        fileName
        mimeType
        sizeBytes
        downloadUrl
        createdAt
      }
    }
  }
`

export const EXPORT_LEADS_CSV = gql`
  query ExportLeadsCsv {
    exportLeadsCsv
  }
`

export const IMPORT_LEADS_CSV = gql`
  mutation ImportLeadsCsv($csvText: String!) {
    importLeadsCsv(csvText: $csvText) {
      created
      skipped
      errors
    }
  }
`

export const GET_LEAD_TIMELINE = gql`
  query GetLeadTimeline($leadId: ID!) {
    getLeadTimeline(leadId: $leadId) {
      id
      kind
      at
      title
      subtitle
      meta
    }
  }
`

export const CREATE_TASK = gql`
  mutation CreateTask($leadId: ID, $dealId: ID, $title: String!, $dueAt: String) {
    createTask(leadId: $leadId, dealId: $dealId, title: $title, dueAt: $dueAt) {
      id
    }
  }
`

export const CREATE_NOTE = gql`
  mutation CreateNote($leadId: ID, $body: String!) {
    createNote(leadId: $leadId, body: $body) {
      id
    }
  }
`

export const ANALYZE_SENTIMENT = gql`
  mutation AnalyzeEmailSentiment($leadId: ID!, $emailBody: String!) {
    analyzeEmailSentiment(leadId: $leadId, emailBody: $emailBody) {
      sentiment
    }
  }
`

export const RUN_INBOUND_SYNC = gql`
  mutation RunInboundSync {
    runInboundEmailSync {
      skipped
      imported
      error
    }
  }
`
