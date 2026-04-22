export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          city: string
          created_at: string | null
          id: string
          name: string
          org_id: string
          timezone: string
          updated_at: string | null
        }
        Insert: {
          city: string
          created_at?: string | null
          id?: string
          name: string
          org_id: string
          timezone: string
          updated_at?: string | null
        }
        Update: {
          city?: string
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          timezone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string | null
          customer_id: string | null
          date_due: string
          description: string
          id: string
          lead_id: string | null
          operation_id: string | null
          org_id: string | null
          status: string
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          date_due: string
          description: string
          id?: string
          lead_id?: string | null
          operation_id?: string | null
          org_id?: string | null
          status?: string
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          date_due?: string
          description?: string
          id?: string
          lead_id?: string | null
          operation_id?: string | null
          org_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          event_type: string
          external_id: string | null
          id: string
          org_id: string | null
          payload: Json
          status: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          org_id?: string | null
          payload?: Json
          status?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          org_id?: string | null
          payload?: Json
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_info: {
        Row: {
          address: string | null
          billing_type: string
          city: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          operation_id: string | null
          phone: string | null
          postal_code: string | null
          quotation_id: string | null
          tax_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          billing_type: string
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          operation_id?: string | null
          phone?: string | null
          postal_code?: string | null
          quotation_id?: string | null
          tax_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          billing_type?: string
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          operation_id?: string | null
          phone?: string | null
          postal_code?: string | null
          quotation_id?: string | null
          tax_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_info_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_info_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      card_transactions: {
        Row: {
          agency_id: string
          amount: number
          authorization_code: string | null
          card_last_four: string | null
          card_type: string
          cash_box_id: string | null
          commission_amount: number | null
          commission_percentage: number | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          id: string
          net_amount: number
          notes: string | null
          operation_id: string | null
          payment_id: string | null
          processor: string | null
          settlement_date: string | null
          status: string
          transaction_date: string
          transaction_number: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          amount: number
          authorization_code?: string | null
          card_last_four?: string | null
          card_type: string
          cash_box_id?: string | null
          commission_amount?: number | null
          commission_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          net_amount: number
          notes?: string | null
          operation_id?: string | null
          payment_id?: string | null
          processor?: string | null
          settlement_date?: string | null
          status?: string
          transaction_date: string
          transaction_number?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          amount?: number
          authorization_code?: string | null
          card_last_four?: string | null
          card_type?: string
          cash_box_id?: string | null
          commission_amount?: number | null
          commission_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          net_amount?: number
          notes?: string | null
          operation_id?: string | null
          payment_id?: string | null
          processor?: string | null
          settlement_date?: string | null
          status?: string
          transaction_date?: string
          transaction_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_transactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_boxes: {
        Row: {
          agency_id: string
          box_type: string
          created_at: string | null
          created_by: string | null
          currency: string
          current_balance: number | null
          description: string | null
          id: string
          initial_balance: number | null
          is_active: boolean | null
          is_default: boolean | null
          name: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          box_type?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          current_balance?: number | null
          description?: string | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          box_type?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          current_balance?: number | null
          description?: string | null
          id?: string
          initial_balance?: number | null
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_boxes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_boxes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          cash_box_id: string | null
          category: string
          category_id: string | null
          cc_payment_group_id: string | null
          created_at: string | null
          currency: string
          expense_classification: string | null
          financial_account_id: string | null
          id: string
          is_touristic: boolean | null
          ledger_movement_id: string | null
          movement_category: string | null
          movement_date: string
          notes: string | null
          operation_id: string | null
          org_id: string | null
          payment_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          cash_box_id?: string | null
          category: string
          category_id?: string | null
          cc_payment_group_id?: string | null
          created_at?: string | null
          currency?: string
          expense_classification?: string | null
          financial_account_id?: string | null
          id?: string
          is_touristic?: boolean | null
          ledger_movement_id?: string | null
          movement_category?: string | null
          movement_date: string
          notes?: string | null
          operation_id?: string | null
          org_id?: string | null
          payment_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          cash_box_id?: string | null
          category?: string
          category_id?: string | null
          cc_payment_group_id?: string | null
          created_at?: string | null
          currency?: string
          expense_classification?: string | null
          financial_account_id?: string | null
          id?: string
          is_touristic?: boolean | null
          ledger_movement_id?: string | null
          movement_category?: string | null
          movement_date?: string
          notes?: string | null
          operation_id?: string | null
          org_id?: string | null
          payment_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "recurring_payment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_cc_payment_group_id_fkey"
            columns: ["cc_payment_group_id"]
            isOneToOne: false
            referencedRelation: "cc_payment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_ledger_movement_id_fkey"
            columns: ["ledger_movement_id"]
            isOneToOne: false
            referencedRelation: "ledger_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transfers: {
        Row: {
          agency_id: string
          amount: number
          created_at: string | null
          created_by: string
          currency: string
          exchange_rate: number | null
          from_box_id: string
          id: string
          notes: string | null
          reference: string | null
          status: string
          to_box_id: string
          transfer_date: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          amount: number
          created_at?: string | null
          created_by: string
          currency: string
          exchange_rate?: number | null
          from_box_id: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          to_box_id: string
          transfer_date: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          amount?: number
          created_at?: string | null
          created_by?: string
          currency?: string
          exchange_rate?: number | null
          from_box_id?: string
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          to_box_id?: string
          transfer_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transfers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_from_box_id_fkey"
            columns: ["from_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_to_box_id_fkey"
            columns: ["to_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      cc_payment_groups: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit_card_account_id: string
          currency: string
          exchange_rate: number | null
          id: string
          notes: string | null
          payment_date: string
          source_account_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credit_card_account_id: string
          currency: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          payment_date: string
          source_account_id: string
          total_amount: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credit_card_account_id?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          payment_date?: string
          source_account_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "cc_payment_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_payment_groups_credit_card_account_id_fkey"
            columns: ["credit_card_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_payment_groups_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_movement_account: boolean | null
          level: number
          org_id: string | null
          parent_id: string | null
          subcategory: string | null
          updated_at: string | null
        }
        Insert: {
          account_code: string
          account_name: string
          account_type?: string | null
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_movement_account?: boolean | null
          level?: number
          org_id?: string | null
          parent_id?: string | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_movement_account?: boolean | null
          level?: number
          org_id?: string | null
          parent_id?: string | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_details: {
        Row: {
          commission_amount: number
          commission_id: string
          commission_percentage: number | null
          created_at: string | null
          id: string
          notes: string | null
          operation_id: string
          operation_margin: number | null
          operation_revenue: number
        }
        Insert: {
          commission_amount: number
          commission_id: string
          commission_percentage?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          operation_id: string
          operation_margin?: number | null
          operation_revenue: number
        }
        Update: {
          commission_amount?: number
          commission_id?: string
          commission_percentage?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          operation_id?: string
          operation_margin?: number | null
          operation_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_details_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_details_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_records: {
        Row: {
          agency_id: string | null
          amount: number
          amount_paid: number | null
          created_at: string | null
          date_calculated: string
          date_paid: string | null
          id: string
          operation_id: string
          org_id: string | null
          percentage: number | null
          seller_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          agency_id?: string | null
          amount: number
          amount_paid?: number | null
          created_at?: string | null
          date_calculated: string
          date_paid?: string | null
          id?: string
          operation_id: string
          org_id?: string | null
          percentage?: number | null
          seller_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string | null
          amount?: number
          amount_paid?: number | null
          created_at?: string | null
          date_calculated?: string
          date_paid?: string | null
          id?: string
          operation_id?: string
          org_id?: string | null
          percentage?: number | null
          seller_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_records_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          agency_id: string | null
          basis: string
          created_at: string | null
          destination_region: string | null
          id: string
          org_id: string | null
          seller_id: string | null
          type: string
          updated_at: string | null
          valid_from: string
          valid_to: string | null
          value: number
        }
        Insert: {
          agency_id?: string | null
          basis: string
          created_at?: string | null
          destination_region?: string | null
          id?: string
          org_id?: string | null
          seller_id?: string | null
          type: string
          updated_at?: string | null
          valid_from: string
          valid_to?: string | null
          value: number
        }
        Update: {
          agency_id?: string | null
          basis?: string
          created_at?: string | null
          destination_region?: string | null
          id?: string
          org_id?: string | null
          seller_id?: string | null
          type?: string
          updated_at?: string | null
          valid_from?: string
          valid_to?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_schemes: {
        Row: {
          agency_id: string
          applies_to: string
          base_amount: number | null
          base_percentage: number | null
          commission_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          max_cap: number | null
          min_threshold: number | null
          name: string
          tiers: Json | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          applies_to?: string
          base_amount?: number | null
          base_percentage?: number | null
          commission_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_cap?: number | null
          min_threshold?: number | null
          name: string
          tiers?: Json | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          applies_to?: string
          base_amount?: number | null
          base_percentage?: number | null
          commission_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          max_cap?: number | null
          min_threshold?: number | null
          name?: string
          tiers?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_schemes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_schemes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          adjustment_notes: string | null
          adjustments: number | null
          agency_id: string
          approved_at: string | null
          approved_by: string | null
          base_margin: number | null
          base_revenue: number | null
          commission_amount: number
          created_at: string | null
          id: string
          operations_count: number | null
          paid_at: string | null
          payment_reference: string | null
          period_end: string
          period_start: string
          scheme_id: string | null
          status: string
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          adjustment_notes?: string | null
          adjustments?: number | null
          agency_id: string
          approved_at?: string | null
          approved_by?: string | null
          base_margin?: number | null
          base_revenue?: number | null
          commission_amount: number
          created_at?: string | null
          id?: string
          operations_count?: number | null
          paid_at?: string | null
          payment_reference?: string | null
          period_end: string
          period_start: string
          scheme_id?: string | null
          status?: string
          total_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          adjustment_notes?: string | null
          adjustments?: number | null
          agency_id?: string
          approved_at?: string | null
          approved_by?: string | null
          base_margin?: number | null
          base_revenue?: number | null
          commission_amount?: number
          created_at?: string | null
          id?: string
          operations_count?: number | null
          paid_at?: string | null
          payment_reference?: string | null
          period_end?: string
          period_start?: string
          scheme_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "commission_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          communication_type: string
          content: string
          created_at: string | null
          customer_id: string | null
          date: string
          duration: number | null
          follow_up_date: string | null
          id: string
          lead_id: string | null
          operation_id: string | null
          subject: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          communication_type: string
          content: string
          created_at?: string | null
          customer_id?: string | null
          date?: string
          duration?: number | null
          follow_up_date?: string | null
          id?: string
          lead_id?: string | null
          operation_id?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          communication_type?: string
          content?: string
          created_at?: string | null
          customer_id?: string | null
          date?: string
          duration?: number | null
          follow_up_date?: string | null
          id?: string
          lead_id?: string | null
          operation_id?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: string
          created_at: string | null
          id: string
          last_message_at: string | null
          last_search_context: Json | null
          state: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_search_context?: Json | null
          state?: string
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          last_search_context?: Json | null
          state?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      custom_plans: {
        Row: {
          base_price_ars: number
          billing_method: string
          created_at: string
          created_by: string
          discount_ends_at: string | null
          discount_percent: number
          display_name: string
          features: Json
          id: string
          limits: Json
          notes: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          base_price_ars: number
          billing_method?: string
          created_at?: string
          created_by: string
          discount_ends_at?: string | null
          discount_percent?: number
          display_name: string
          features?: Json
          id?: string
          limits?: Json
          notes?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          base_price_ars?: number
          billing_method?: string
          created_at?: string
          created_by?: string
          discount_ends_at?: string | null
          discount_percent?: number
          display_name?: string
          features?: Json
          id?: string
          limits?: Json
          notes?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_interactions: {
        Row: {
          agency_id: string
          attachments: Json | null
          content: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string
          direction: string | null
          duration_minutes: number | null
          follow_up_date: string | null
          follow_up_notes: string | null
          id: string
          interaction_type: string
          is_follow_up_completed: boolean | null
          operation_id: string | null
          outcome: string | null
          subject: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          attachments?: Json | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          direction?: string | null
          duration_minutes?: number | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          interaction_type: string
          is_follow_up_completed?: boolean | null
          operation_id?: string | null
          outcome?: string | null
          subject?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          attachments?: Json | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          direction?: string | null
          duration_minutes?: number | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          interaction_type?: string
          is_follow_up_completed?: boolean | null
          operation_id?: string | null
          outcome?: string | null
          subject?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_interactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_interactions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segment_members: {
        Row: {
          added_at: string | null
          added_by: string | null
          customer_id: string
          id: string
          membership_type: string
          segment_id: string
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          customer_id: string
          id?: string
          membership_type?: string
          segment_id: string
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          customer_id?: string
          id?: string
          membership_type?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_segment_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_segment_members_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "customer_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segments: {
        Row: {
          agency_id: string
          auto_update: boolean | null
          color: string | null
          created_at: string | null
          created_by: string | null
          customer_count: number | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          last_calculated_at: string | null
          name: string
          org_id: string | null
          priority: number | null
          rules: Json | null
          rules_logic: string | null
          segment_type: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          auto_update?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_count?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          last_calculated_at?: string | null
          name: string
          org_id?: string | null
          priority?: number | null
          rules?: Json | null
          rules_logic?: string | null
          segment_type?: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          auto_update?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_count?: number | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          last_calculated_at?: string | null
          name?: string
          org_id?: string | null
          priority?: number | null
          rules?: Json | null
          rules_logic?: string | null
          segment_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_segments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_settings: {
        Row: {
          agency_id: string
          auto_assign_lead: boolean | null
          created_at: string | null
          created_by: string | null
          custom_fields: Json | null
          duplicate_check_enabled: boolean | null
          duplicate_check_fields: string[] | null
          id: string
          integrations: Json | null
          notifications: Json | null
          org_id: string | null
          require_document: boolean | null
          updated_at: string | null
          updated_by: string | null
          validations: Json | null
        }
        Insert: {
          agency_id: string
          auto_assign_lead?: boolean | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          duplicate_check_enabled?: boolean | null
          duplicate_check_fields?: string[] | null
          id?: string
          integrations?: Json | null
          notifications?: Json | null
          org_id?: string | null
          require_document?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          validations?: Json | null
        }
        Update: {
          agency_id?: string
          auto_assign_lead?: boolean | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          duplicate_check_enabled?: boolean | null
          duplicate_check_fields?: string[] | null
          id?: string
          integrations?: Json | null
          notifications?: Json | null
          org_id?: string | null
          require_document?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          validations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          date_of_birth: string | null
          destination: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          first_name: string
          id: string
          instagram_handle: string | null
          last_name: string
          nationality: string | null
          org_id: string
          phone: string
          procedure_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date_of_birth?: string | null
          destination?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          first_name: string
          id?: string
          instagram_handle?: string | null
          last_name: string
          nationality?: string | null
          org_id: string
          phone: string
          procedure_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date_of_birth?: string | null
          destination?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          first_name?: string
          id?: string
          instagram_handle?: string | null
          last_name?: string
          nationality?: string | null
          org_id?: string
          phone?: string
          procedure_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          country: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          name_normalized: string
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          name_normalized: string
        }
        Update: {
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_normalized?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          customer_id: string | null
          file_url: string
          id: string
          lead_id: string | null
          operation_id: string | null
          org_id: string | null
          passenger_id: string | null
          scanned_data: Json | null
          type: string
          uploaded_at: string | null
          uploaded_by_user_id: string
        }
        Insert: {
          customer_id?: string | null
          file_url: string
          id?: string
          lead_id?: string | null
          operation_id?: string | null
          org_id?: string | null
          passenger_id?: string | null
          scanned_data?: Json | null
          type: string
          uploaded_at?: string | null
          uploaded_by_user_id: string
        }
        Update: {
          customer_id?: string | null
          file_url?: string
          id?: string
          lead_id?: string | null
          operation_id?: string | null
          org_id?: string | null
          passenger_id?: string | null
          scanned_data?: Json | null
          type?: string
          uploaded_at?: string | null
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "operation_passengers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_receipts: {
        Row: {
          cash_movement_id: string | null
          created_at: string | null
          document_id: string
          id: string
          recurring_payment_id: string | null
        }
        Insert: {
          cash_movement_id?: string | null
          created_at?: string | null
          document_id: string
          id?: string
          recurring_payment_id?: string | null
        }
        Update: {
          cash_movement_id?: string | null
          created_at?: string | null
          document_id?: string
          id?: string
          recurring_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_recurring_payment_id_fkey"
            columns: ["recurring_payment_id"]
            isOneToOne: false
            referencedRelation: "recurring_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_number: string | null
          agency_id: string | null
          asset_description: string | null
          asset_quantity: number | null
          asset_type: string | null
          bank_name: string | null
          card_cvv: string | null
          card_expiry_date: string | null
          card_holder: string | null
          card_number: string | null
          chart_account_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          id: string
          initial_balance: number
          is_active: boolean | null
          name: string
          notes: string | null
          org_id: string
          type: string
        }
        Insert: {
          account_number?: string | null
          agency_id?: string | null
          asset_description?: string | null
          asset_quantity?: number | null
          asset_type?: string | null
          bank_name?: string | null
          card_cvv?: string | null
          card_expiry_date?: string | null
          card_holder?: string | null
          card_number?: string | null
          chart_account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency: string
          id?: string
          initial_balance?: number
          is_active?: boolean | null
          name: string
          notes?: string | null
          org_id: string
          type: string
        }
        Update: {
          account_number?: string | null
          agency_id?: string | null
          asset_description?: string | null
          asset_quantity?: number | null
          asset_type?: string | null
          bank_name?: string | null
          card_cvv?: string | null
          card_expiry_date?: string | null
          card_holder?: string | null
          card_number?: string | null
          chart_account_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          initial_balance?: number
          is_active?: boolean | null
          name?: string
          notes?: string | null
          org_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_accounts_chart_account_id_fkey"
            columns: ["chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_settings: {
        Row: {
          agency_id: string
          auto_calculate_commissions: boolean | null
          auto_close_month: boolean | null
          auto_create_accounts: boolean | null
          auto_create_iva_entries: boolean | null
          auto_create_ledger_entries: boolean | null
          auto_create_operator_payments: boolean | null
          auto_generate_invoices: boolean | null
          created_at: string | null
          created_by: string | null
          default_accounts: Json | null
          default_commission_rules: Json | null
          default_expense_chart_account_id: string | null
          default_income_chart_account_id: string | null
          default_iva_rate: number | null
          default_point_of_sale: number | null
          default_usd_rate: number | null
          enabled_currencies: Json | null
          enabled_payment_methods: Json | null
          exchange_rate_config: Json | null
          ganancias_rate: number | null
          id: string
          iibb_convenio_multilateral: boolean | null
          iibb_jurisdiction: string | null
          iibb_jurisdictions: Json | null
          iibb_rate: number | null
          monthly_close_day: number | null
          org_id: string | null
          primary_currency: string | null
          retention_ganancias_rate: number | null
          retention_iva_rate: number | null
          tax_regime: string | null
          updated_at: string | null
          updated_by: string | null
          withholding_rules: Json | null
          withholdings_enabled: boolean
        }
        Insert: {
          agency_id: string
          auto_calculate_commissions?: boolean | null
          auto_close_month?: boolean | null
          auto_create_accounts?: boolean | null
          auto_create_iva_entries?: boolean | null
          auto_create_ledger_entries?: boolean | null
          auto_create_operator_payments?: boolean | null
          auto_generate_invoices?: boolean | null
          created_at?: string | null
          created_by?: string | null
          default_accounts?: Json | null
          default_commission_rules?: Json | null
          default_expense_chart_account_id?: string | null
          default_income_chart_account_id?: string | null
          default_iva_rate?: number | null
          default_point_of_sale?: number | null
          default_usd_rate?: number | null
          enabled_currencies?: Json | null
          enabled_payment_methods?: Json | null
          exchange_rate_config?: Json | null
          ganancias_rate?: number | null
          id?: string
          iibb_convenio_multilateral?: boolean | null
          iibb_jurisdiction?: string | null
          iibb_jurisdictions?: Json | null
          iibb_rate?: number | null
          monthly_close_day?: number | null
          org_id?: string | null
          primary_currency?: string | null
          retention_ganancias_rate?: number | null
          retention_iva_rate?: number | null
          tax_regime?: string | null
          updated_at?: string | null
          updated_by?: string | null
          withholding_rules?: Json | null
          withholdings_enabled?: boolean
        }
        Update: {
          agency_id?: string
          auto_calculate_commissions?: boolean | null
          auto_close_month?: boolean | null
          auto_create_accounts?: boolean | null
          auto_create_iva_entries?: boolean | null
          auto_create_ledger_entries?: boolean | null
          auto_create_operator_payments?: boolean | null
          auto_generate_invoices?: boolean | null
          created_at?: string | null
          created_by?: string | null
          default_accounts?: Json | null
          default_commission_rules?: Json | null
          default_expense_chart_account_id?: string | null
          default_income_chart_account_id?: string | null
          default_iva_rate?: number | null
          default_point_of_sale?: number | null
          default_usd_rate?: number | null
          enabled_currencies?: Json | null
          enabled_payment_methods?: Json | null
          exchange_rate_config?: Json | null
          ganancias_rate?: number | null
          id?: string
          iibb_convenio_multilateral?: boolean | null
          iibb_jurisdiction?: string | null
          iibb_jurisdictions?: Json | null
          iibb_rate?: number | null
          monthly_close_day?: number | null
          org_id?: string | null
          primary_currency?: string | null
          retention_ganancias_rate?: number | null
          retention_iva_rate?: number | null
          tax_regime?: string | null
          updated_at?: string | null
          updated_by?: string | null
          withholding_rules?: Json | null
          withholdings_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "financial_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_settings_default_expense_chart_account_id_fkey"
            columns: ["default_expense_chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_settings_default_income_chart_account_id_fkey"
            columns: ["default_income_chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_pdfs: {
        Row: {
          agency_id: string
          created_at: string | null
          data_snapshot: Json | null
          file_name: string
          file_size: number | null
          file_url: string
          generated_by: string | null
          id: string
          pdf_type: string
          reference_id: string | null
          reference_type: string | null
          template_id: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string | null
          data_snapshot?: Json | null
          file_name: string
          file_size?: number | null
          file_url: string
          generated_by?: string | null
          id?: string
          pdf_type: string
          reference_id?: string | null
          reference_type?: string | null
          template_id?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string | null
          data_snapshot?: Json | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          generated_by?: string | null
          id?: string
          pdf_type?: string
          reference_id?: string | null
          reference_type?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_pdfs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_pdfs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_pdfs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pdf_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          duration_ms: number | null
          id: string
          integration_id: string
          log_type: string
          message: string
          request_data: Json | null
          response_data: Json | null
          response_status: number | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          integration_id: string
          log_type: string
          message: string
          request_data?: Json | null
          response_data?: Json | null
          response_status?: number | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          integration_id?: string
          log_type?: string
          message?: string
          request_data?: Json | null
          response_data?: Json | null
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhooks: {
        Row: {
          error_message: string | null
          event_type: string
          headers: Json | null
          id: string
          integration_id: string
          payload: Json
          processed_at: string | null
          received_at: string | null
          status: string
        }
        Insert: {
          error_message?: string | null
          event_type: string
          headers?: Json | null
          id?: string
          integration_id: string
          payload: Json
          processed_at?: string | null
          received_at?: string | null
          status?: string
        }
        Update: {
          error_message?: string | null
          event_type?: string
          headers?: Json | null
          id?: string
          integration_id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhooks_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          agency_id: string
          config: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          error_message: string | null
          id: string
          integration_type: string
          last_sync_at: string | null
          name: string
          next_sync_at: string | null
          org_id: string | null
          permissions: Json | null
          status: string
          sync_enabled: boolean | null
          sync_frequency: string | null
          updated_at: string | null
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          agency_id: string
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          integration_type: string
          last_sync_at?: string | null
          name: string
          next_sync_at?: string | null
          org_id?: string | null
          permissions?: Json | null
          status?: string
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          agency_id?: string
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          integration_type?: string
          last_sync_at?: string | null
          name?: string
          next_sync_at?: string | null
          org_id?: string | null
          permissions?: Json | null
          status?: string
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cantidad: number
          created_at: string | null
          descripcion: string
          id: string
          invoice_id: string
          iva_id: number
          iva_importe: number
          iva_porcentaje: number
          orden: number | null
          precio_unitario: number
          subtotal: number
          tax_treatment: string
          total: number
        }
        Insert: {
          cantidad?: number
          created_at?: string | null
          descripcion: string
          id?: string
          invoice_id: string
          iva_id?: number
          iva_importe?: number
          iva_porcentaje?: number
          orden?: number | null
          precio_unitario: number
          subtotal: number
          tax_treatment?: string
          total: number
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          descripcion?: string
          id?: string
          invoice_id?: string
          iva_id?: number
          iva_importe?: number
          iva_porcentaje?: number
          orden?: number | null
          precio_unitario?: number
          subtotal?: number
          tax_treatment?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          afip_response: Json | null
          agency_id: string
          amount_entry_mode: string
          cae: string | null
          cae_fch_vto: string | null
          cbte_nro: number | null
          cbte_tipo: number
          concepto: number | null
          cotizacion: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          fch_serv_desde: string | null
          fch_serv_hasta: string | null
          fecha_emision: string | null
          fecha_vto_pago: string | null
          id: string
          imp_iva: number
          imp_neto: number
          imp_op_ex: number | null
          imp_tot_conc: number | null
          imp_total: number
          imp_trib: number | null
          moneda: string | null
          notes: string | null
          operation_id: string | null
          org_id: string | null
          pdf_url: string | null
          pto_vta: number
          receptor_condicion_iva: number | null
          receptor_doc_nro: string
          receptor_doc_tipo: number
          receptor_domicilio: string | null
          receptor_nombre: string
          status: string
          updated_at: string | null
        }
        Insert: {
          afip_response?: Json | null
          agency_id: string
          amount_entry_mode?: string
          cae?: string | null
          cae_fch_vto?: string | null
          cbte_nro?: number | null
          cbte_tipo: number
          concepto?: number | null
          cotizacion?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          fch_serv_desde?: string | null
          fch_serv_hasta?: string | null
          fecha_emision?: string | null
          fecha_vto_pago?: string | null
          id?: string
          imp_iva?: number
          imp_neto?: number
          imp_op_ex?: number | null
          imp_tot_conc?: number | null
          imp_total?: number
          imp_trib?: number | null
          moneda?: string | null
          notes?: string | null
          operation_id?: string | null
          org_id?: string | null
          pdf_url?: string | null
          pto_vta: number
          receptor_condicion_iva?: number | null
          receptor_doc_nro: string
          receptor_doc_tipo?: number
          receptor_domicilio?: string | null
          receptor_nombre: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          afip_response?: Json | null
          agency_id?: string
          amount_entry_mode?: string
          cae?: string | null
          cae_fch_vto?: string | null
          cbte_nro?: number | null
          cbte_tipo?: number
          concepto?: number | null
          cotizacion?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          fch_serv_desde?: string | null
          fch_serv_hasta?: string | null
          fecha_emision?: string | null
          fecha_vto_pago?: string | null
          id?: string
          imp_iva?: number
          imp_neto?: number
          imp_op_ex?: number | null
          imp_tot_conc?: number | null
          imp_total?: number
          imp_trib?: number | null
          moneda?: string | null
          notes?: string | null
          operation_id?: string | null
          org_id?: string | null
          pdf_url?: string | null
          pto_vta?: number
          receptor_condicion_iva?: number | null
          receptor_doc_nro?: string
          receptor_doc_tipo?: number
          receptor_domicilio?: string | null
          receptor_nombre?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          airline: string | null
          car_company: string | null
          car_details: string | null
          car_pickup_date: string | null
          car_pickup_location: string | null
          car_return_date: string | null
          car_return_location: string | null
          checkin_date: string | null
          checkout_date: string | null
          created_at: string | null
          date_from: string | null
          date_to: string | null
          destination_city: string | null
          flight_date: string | null
          flight_route: string | null
          hotel_address: string | null
          hotel_name: string | null
          hotel_phone: string | null
          hotel_photo_url: string | null
          hotel_stars: number | null
          id: string
          image_url: string | null
          item_type: string
          meal_plan: string | null
          nights: number | null
          notes: string | null
          operation_id: string
          org_id: string
          room_type: string | null
          rooms: number | null
          sort_order: number
          transfer_description: string | null
          updated_at: string | null
        }
        Insert: {
          airline?: string | null
          car_company?: string | null
          car_details?: string | null
          car_pickup_date?: string | null
          car_pickup_location?: string | null
          car_return_date?: string | null
          car_return_location?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          created_at?: string | null
          date_from?: string | null
          date_to?: string | null
          destination_city?: string | null
          flight_date?: string | null
          flight_route?: string | null
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          hotel_photo_url?: string | null
          hotel_stars?: number | null
          id?: string
          image_url?: string | null
          item_type: string
          meal_plan?: string | null
          nights?: number | null
          notes?: string | null
          operation_id: string
          org_id: string
          room_type?: string | null
          rooms?: number | null
          sort_order?: number
          transfer_description?: string | null
          updated_at?: string | null
        }
        Update: {
          airline?: string | null
          car_company?: string | null
          car_details?: string | null
          car_pickup_date?: string | null
          car_pickup_location?: string | null
          car_return_date?: string | null
          car_return_location?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          created_at?: string | null
          date_from?: string | null
          date_to?: string | null
          destination_city?: string | null
          flight_date?: string | null
          flight_route?: string | null
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          hotel_photo_url?: string | null
          hotel_stars?: number | null
          id?: string
          image_url?: string | null
          item_type?: string
          meal_plan?: string | null
          nights?: number | null
          notes?: string | null
          operation_id?: string
          org_id?: string
          room_type?: string | null
          rooms?: number | null
          sort_order?: number
          transfer_description?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      iva_purchases: {
        Row: {
          created_at: string | null
          currency: string
          id: string
          iva_amount: number
          iva_rate: number | null
          net_amount: number
          operation_id: string
          operator_cost_total: number
          operator_id: string | null
          org_id: string | null
          purchase_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency: string
          id?: string
          iva_amount: number
          iva_rate?: number | null
          net_amount: number
          operation_id: string
          operator_cost_total: number
          operator_id?: string | null
          org_id?: string | null
          purchase_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          iva_amount?: number
          iva_rate?: number | null
          net_amount?: number
          operation_id?: string
          operator_cost_total?: number
          operator_id?: string | null
          org_id?: string | null
          purchase_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iva_purchases_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iva_purchases_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iva_purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      iva_sales: {
        Row: {
          created_at: string | null
          currency: string
          id: string
          is_exempt: boolean | null
          iva_amount: number
          iva_rate: number | null
          net_amount: number
          operation_id: string
          org_id: string | null
          sale_amount_total: number
          sale_date: string
          service_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency: string
          id?: string
          is_exempt?: boolean | null
          iva_amount: number
          iva_rate?: number | null
          net_amount: number
          operation_id: string
          org_id?: string | null
          sale_amount_total: number
          sale_date: string
          service_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          is_exempt?: boolean | null
          iva_amount?: number
          iva_rate?: number | null
          net_amount?: number
          operation_id?: string
          org_id?: string | null
          sale_amount_total?: number
          sale_date?: string
          service_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iva_sales_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iva_sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string
          description: string
          entry_date: string
          entry_number: number
          id: string
          is_balanced: boolean
          notes: string | null
          operation_id: string | null
          org_id: string | null
          source: string
          total_amount: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description: string
          entry_date: string
          entry_number?: number
          id?: string
          is_balanced?: boolean
          notes?: string | null
          operation_id?: string | null
          org_id?: string | null
          source?: string
          total_amount?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string
          entry_date?: string
          entry_number?: number
          id?: string
          is_balanced?: boolean
          notes?: string | null
          operation_id?: string | null
          org_id?: string | null
          source?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_comments: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          lead_id: string
          org_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: string
          lead_id: string
          org_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          org_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_comments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agency_id: string
          archived_at: string | null
          assigned_seller_id: string | null
          contact_email: string | null
          contact_instagram: string | null
          contact_name: string
          contact_phone: string
          created_at: string | null
          deposit_account_id: string | null
          deposit_amount: number | null
          deposit_currency: string | null
          deposit_date: string | null
          deposit_method: string | null
          destination: string
          estimated_checkin_date: string | null
          estimated_departure_date: string | null
          external_id: string | null
          follow_up_date: string | null
          has_deposit: boolean | null
          id: string
          list_name: string | null
          manychat_full_data: Json | null
          notes: string | null
          org_id: string | null
          quoted_price: number | null
          region: string
          source: string | null
          status: string
          trello_full_data: Json | null
          trello_list_id: string | null
          trello_url: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          assigned_seller_id?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string | null
          deposit_account_id?: string | null
          deposit_amount?: number | null
          deposit_currency?: string | null
          deposit_date?: string | null
          deposit_method?: string | null
          destination: string
          estimated_checkin_date?: string | null
          estimated_departure_date?: string | null
          external_id?: string | null
          follow_up_date?: string | null
          has_deposit?: boolean | null
          id?: string
          list_name?: string | null
          manychat_full_data?: Json | null
          notes?: string | null
          org_id?: string | null
          quoted_price?: number | null
          region: string
          source?: string | null
          status?: string
          trello_full_data?: Json | null
          trello_list_id?: string | null
          trello_url?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          assigned_seller_id?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string | null
          deposit_account_id?: string | null
          deposit_amount?: number | null
          deposit_currency?: string | null
          deposit_date?: string | null
          deposit_method?: string | null
          destination?: string
          estimated_checkin_date?: string | null
          estimated_departure_date?: string | null
          external_id?: string | null
          follow_up_date?: string | null
          has_deposit?: boolean | null
          id?: string
          list_name?: string | null
          manychat_full_data?: Json | null
          notes?: string | null
          org_id?: string | null
          quoted_price?: number | null
          region?: string
          source?: string | null
          status?: string
          trello_full_data?: Json | null
          trello_list_id?: string | null
          trello_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_seller_id_fkey"
            columns: ["assigned_seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_movements: {
        Row: {
          account_id: string | null
          affects_balance: boolean
          amount_ars_equivalent: number
          amount_original: number
          chart_account_id: string | null
          concept: string
          created_at: string | null
          created_by: string | null
          credit_amount: number | null
          currency: string
          debit_amount: number | null
          exchange_rate: number | null
          id: string
          journal_entry_id: string | null
          lead_id: string | null
          method: string
          movement_date: string
          notes: string | null
          operation_id: string | null
          operator_id: string | null
          org_id: string | null
          receipt_number: string | null
          seller_id: string | null
          type: string
        }
        Insert: {
          account_id?: string | null
          affects_balance?: boolean
          amount_ars_equivalent: number
          amount_original: number
          chart_account_id?: string | null
          concept: string
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number | null
          currency: string
          debit_amount?: number | null
          exchange_rate?: number | null
          id?: string
          journal_entry_id?: string | null
          lead_id?: string | null
          method: string
          movement_date?: string
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          org_id?: string | null
          receipt_number?: string | null
          seller_id?: string | null
          type: string
        }
        Update: {
          account_id?: string | null
          affects_balance?: boolean
          amount_ars_equivalent?: number
          amount_original?: number
          chart_account_id?: string | null
          concept?: string
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number | null
          currency?: string
          debit_amount?: number | null
          exchange_rate?: number | null
          id?: string
          journal_entry_id?: string | null
          lead_id?: string | null
          method?: string
          movement_date?: string
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          org_id?: string | null
          receipt_number?: string | null
          seller_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_chart_account_id_fkey"
            columns: ["chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_movements_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payments: {
        Row: {
          amount_ars: number
          covers_from: string
          covers_to: string
          created_at: string
          id: string
          org_id: string
          paid_at: string
          payment_method: string | null
          receipt_ref: string | null
          registered_by: string
        }
        Insert: {
          amount_ars: number
          covers_from: string
          covers_to: string
          created_at?: string
          id?: string
          org_id: string
          paid_at: string
          payment_method?: string | null
          receipt_ref?: string | null
          registered_by: string
        }
        Update: {
          amount_ars?: number
          covers_from?: string
          covers_to?: string
          created_at?: string
          id?: string
          org_id?: string
          paid_at?: string
          payment_method?: string | null
          receipt_ref?: string | null
          registered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_payments_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      manychat_list_order: {
        Row: {
          agency_id: string
          created_at: string | null
          id: string
          list_name: string
          org_id: string
          position: number
          seller_id: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string | null
          id?: string
          list_name: string
          org_id: string
          position: number
          seller_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string | null
          id?: string
          list_name?: string
          org_id?: string
          position?: number
          seller_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manychat_list_order_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manychat_list_order_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manychat_list_order_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          agency_id: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          emoji_prefix: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          send_hour_from: number | null
          send_hour_to: number | null
          template: string
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          agency_id?: string | null
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          emoji_prefix?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          send_hour_from?: number | null
          send_hour_to?: number | null
          template: string
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          emoji_prefix?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          send_hour_from?: number | null
          send_hour_to?: number | null
          template?: string
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          api_request_id: string | null
          api_search_id: string | null
          client_id: string | null
          content: Json
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          api_request_id?: string | null
          api_search_id?: string | null
          client_id?: string | null
          content: Json
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          api_request_id?: string | null
          api_search_id?: string | null
          client_id?: string | null
          content?: Json
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_exchange_rates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          month: number
          updated_at: string | null
          usd_to_ars_rate: number
          year: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          month: number
          updated_at?: string | null
          usd_to_ars_rate: number
          year: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          month?: number
          updated_at?: string | null
          usd_to_ars_rate?: number
          year?: number
        }
        Relationships: []
      }
      non_touristic_categories: {
        Row: {
          category_type: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_income: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          category_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_income?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          category_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_income?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      note_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          note_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          note_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          note_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      note_comments: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          note_id: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note_id: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note_id?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_comments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "note_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          agency_id: string
          color: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          is_pinned: boolean | null
          note_type: string
          operation_id: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          agency_id: string
          color?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_pinned?: boolean | null
          note_type?: string
          operation_id?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          agency_id?: string
          color?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_pinned?: boolean | null
          note_type?: string
          operation_id?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_customers: {
        Row: {
          customer_id: string
          id: string
          operation_id: string
          org_id: string | null
          role: string
        }
        Insert: {
          customer_id: string
          id?: string
          operation_id: string
          org_id?: string | null
          role?: string
        }
        Update: {
          customer_id?: string
          id?: string
          operation_id?: string
          org_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_customers_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_operators: {
        Row: {
          cost: number
          cost_currency: string
          created_at: string | null
          id: string
          notes: string | null
          operation_id: string
          operator_id: string
          org_id: string | null
          product_type: string | null
          updated_at: string | null
        }
        Insert: {
          cost?: number
          cost_currency?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          operation_id: string
          operator_id: string
          org_id?: string | null
          product_type?: string | null
          updated_at?: string | null
        }
        Update: {
          cost?: number
          cost_currency?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          operation_id?: string
          operator_id?: string
          org_id?: string | null
          product_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_operators_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_operators_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_operators_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_passengers: {
        Row: {
          billing_info_id: string | null
          created_at: string | null
          date_of_birth: string | null
          document_number: string | null
          document_type: string | null
          first_name: string
          id: string
          is_main_passenger: boolean | null
          last_name: string
          nationality: string | null
          operation_id: string
          org_id: string | null
          passenger_number: number
          updated_at: string | null
        }
        Insert: {
          billing_info_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          document_number?: string | null
          document_type?: string | null
          first_name: string
          id?: string
          is_main_passenger?: boolean | null
          last_name: string
          nationality?: string | null
          operation_id: string
          org_id?: string | null
          passenger_number: number
          updated_at?: string | null
        }
        Update: {
          billing_info_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          document_number?: string | null
          document_type?: string | null
          first_name?: string
          id?: string
          is_main_passenger?: boolean | null
          last_name?: string
          nationality?: string | null
          operation_id?: string
          org_id?: string | null
          passenger_number?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_passengers_billing_info_id_fkey"
            columns: ["billing_info_id"]
            isOneToOne: false
            referencedRelation: "billing_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_passengers_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_passengers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_services: {
        Row: {
          agency_id: string
          airline: string | null
          checkin_date: string | null
          checkout_date: string | null
          commission_record_id: string | null
          cost_amount: number
          cost_currency: string
          created_at: string
          description: string | null
          flight_class: string | null
          flight_date: string | null
          flight_return_date: string | null
          flight_route: string | null
          flight_stops: number | null
          generates_commission: boolean
          hotel_address: string | null
          hotel_name: string | null
          hotel_phone: string | null
          hotel_stars: number | null
          id: string
          itinerary_item_id: string | null
          ledger_expense_id: string | null
          ledger_income_id: string | null
          margin_amount: number | null
          meal_plan: string | null
          nights: number | null
          operation_id: string
          operator_id: string | null
          operator_payment_id: string | null
          org_id: string | null
          payment_id: string | null
          room_type: string | null
          rooms: number | null
          sale_amount: number
          sale_currency: string
          service_type: Database["public"]["Enums"]["operation_service_type"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          airline?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          commission_record_id?: string | null
          cost_amount?: number
          cost_currency?: string
          created_at?: string
          description?: string | null
          flight_class?: string | null
          flight_date?: string | null
          flight_return_date?: string | null
          flight_route?: string | null
          flight_stops?: number | null
          generates_commission?: boolean
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          hotel_stars?: number | null
          id?: string
          itinerary_item_id?: string | null
          ledger_expense_id?: string | null
          ledger_income_id?: string | null
          margin_amount?: number | null
          meal_plan?: string | null
          nights?: number | null
          operation_id: string
          operator_id?: string | null
          operator_payment_id?: string | null
          org_id?: string | null
          payment_id?: string | null
          room_type?: string | null
          rooms?: number | null
          sale_amount?: number
          sale_currency?: string
          service_type: Database["public"]["Enums"]["operation_service_type"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          airline?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          commission_record_id?: string | null
          cost_amount?: number
          cost_currency?: string
          created_at?: string
          description?: string | null
          flight_class?: string | null
          flight_date?: string | null
          flight_return_date?: string | null
          flight_route?: string | null
          flight_stops?: number | null
          generates_commission?: boolean
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          hotel_stars?: number | null
          id?: string
          itinerary_item_id?: string | null
          ledger_expense_id?: string | null
          ledger_income_id?: string | null
          margin_amount?: number | null
          meal_plan?: string | null
          nights?: number | null
          operation_id?: string
          operator_id?: string | null
          operator_payment_id?: string | null
          org_id?: string | null
          payment_id?: string | null
          room_type?: string | null
          rooms?: number | null
          sale_amount?: number
          sale_currency?: string
          service_type?: Database["public"]["Enums"]["operation_service_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_services_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_services_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_services_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_services_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_settings: {
        Row: {
          agency_id: string
          alert_operator_payment_days: number | null
          alert_payment_due_days: number | null
          alert_upcoming_trip_days: number | null
          auto_alerts: Json | null
          auto_create_iva_entry: boolean | null
          auto_create_ledger_entry: boolean | null
          auto_create_operator_payment: boolean | null
          auto_generate_invoice: boolean | null
          auto_generate_quotation: boolean | null
          created_at: string | null
          created_by: string | null
          custom_statuses: Json | null
          default_status: string | null
          document_templates: Json | null
          id: string
          org_id: string | null
          require_customer: boolean | null
          require_departure_date: boolean | null
          require_destination: boolean | null
          require_documents_before_confirmation: boolean | null
          require_operator: boolean | null
          updated_at: string | null
          updated_by: string | null
          workflows: Json | null
        }
        Insert: {
          agency_id: string
          alert_operator_payment_days?: number | null
          alert_payment_due_days?: number | null
          alert_upcoming_trip_days?: number | null
          auto_alerts?: Json | null
          auto_create_iva_entry?: boolean | null
          auto_create_ledger_entry?: boolean | null
          auto_create_operator_payment?: boolean | null
          auto_generate_invoice?: boolean | null
          auto_generate_quotation?: boolean | null
          created_at?: string | null
          created_by?: string | null
          custom_statuses?: Json | null
          default_status?: string | null
          document_templates?: Json | null
          id?: string
          org_id?: string | null
          require_customer?: boolean | null
          require_departure_date?: boolean | null
          require_destination?: boolean | null
          require_documents_before_confirmation?: boolean | null
          require_operator?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          workflows?: Json | null
        }
        Update: {
          agency_id?: string
          alert_operator_payment_days?: number | null
          alert_payment_due_days?: number | null
          alert_upcoming_trip_days?: number | null
          auto_alerts?: Json | null
          auto_create_iva_entry?: boolean | null
          auto_create_ledger_entry?: boolean | null
          auto_create_operator_payment?: boolean | null
          auto_generate_invoice?: boolean | null
          auto_generate_quotation?: boolean | null
          created_at?: string | null
          created_by?: string | null
          custom_statuses?: Json | null
          default_status?: string | null
          document_templates?: Json | null
          id?: string
          org_id?: string | null
          require_customer?: boolean | null
          require_departure_date?: boolean | null
          require_destination?: boolean | null
          require_documents_before_confirmation?: boolean | null
          require_operator?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          workflows?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          adults: number | null
          agency_id: string
          billing_margin_amount: number | null
          billing_margin_percentage: number | null
          checkin_date: string | null
          checkout_date: string | null
          children: number | null
          commission_split: number | null
          created_at: string | null
          currency: string
          departure_date: string
          destination: string
          destination_id: string | null
          file_code: string | null
          id: string
          infants: number | null
          lead_id: string | null
          margin_amount: number
          margin_percentage: number
          operation_date: string
          operator_cost: number
          operator_cost_currency: string | null
          operator_id: string | null
          org_id: string | null
          origin: string | null
          passengers: Json | null
          product_type: string | null
          reservation_code_air: string | null
          reservation_code_hotel: string | null
          return_date: string | null
          sale_amount_total: number
          sale_currency: string | null
          seller_id: string
          seller_secondary_id: string | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          adults?: number | null
          agency_id: string
          billing_margin_amount?: number | null
          billing_margin_percentage?: number | null
          checkin_date?: string | null
          checkout_date?: string | null
          children?: number | null
          commission_split?: number | null
          created_at?: string | null
          currency?: string
          departure_date: string
          destination: string
          destination_id?: string | null
          file_code?: string | null
          id?: string
          infants?: number | null
          lead_id?: string | null
          margin_amount: number
          margin_percentage: number
          operation_date?: string
          operator_cost: number
          operator_cost_currency?: string | null
          operator_id?: string | null
          org_id?: string | null
          origin?: string | null
          passengers?: Json | null
          product_type?: string | null
          reservation_code_air?: string | null
          reservation_code_hotel?: string | null
          return_date?: string | null
          sale_amount_total: number
          sale_currency?: string | null
          seller_id: string
          seller_secondary_id?: string | null
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          adults?: number | null
          agency_id?: string
          billing_margin_amount?: number | null
          billing_margin_percentage?: number | null
          checkin_date?: string | null
          checkout_date?: string | null
          children?: number | null
          commission_split?: number | null
          created_at?: string | null
          currency?: string
          departure_date?: string
          destination?: string
          destination_id?: string | null
          file_code?: string | null
          id?: string
          infants?: number | null
          lead_id?: string | null
          margin_amount?: number
          margin_percentage?: number
          operation_date?: string
          operator_cost?: number
          operator_cost_currency?: string | null
          operator_id?: string | null
          org_id?: string | null
          origin?: string | null
          passengers?: Json | null
          product_type?: string | null
          reservation_code_air?: string | null
          reservation_code_hotel?: string | null
          return_date?: string | null
          sale_amount_total?: number
          sale_currency?: string | null
          seller_id?: string
          seller_secondary_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_seller_secondary_id_fkey"
            columns: ["seller_secondary_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string
          due_date: string
          id: string
          ledger_movement_id: string | null
          notes: string | null
          operation_id: string | null
          operator_id: string
          org_id: string | null
          paid_amount: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency: string
          due_date: string
          id?: string
          ledger_movement_id?: string | null
          notes?: string | null
          operation_id?: string | null
          operator_id: string
          org_id?: string | null
          paid_amount?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string
          due_date?: string
          id?: string
          ledger_movement_id?: string | null
          notes?: string | null
          operation_id?: string | null
          operator_id?: string
          org_id?: string | null
          paid_amount?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_payments_ledger_movement_id_fkey"
            columns: ["ledger_movement_id"]
            isOneToOne: false
            referencedRelation: "ledger_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_payments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_payments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          credit_limit: number | null
          id: string
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          credit_limit?: number | null
          id?: string
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          credit_limit?: number | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operators_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          id: string
          key: string
          org_id: string | null
          updated_at: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          org_id?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          org_id?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          billing_name: string | null
          brand_color: string | null
          created_at: string
          cuit: string | null
          current_period_ends_at: string | null
          custom_plan_id: string | null
          features: Json
          grace_period_ends_at: string | null
          has_used_trial: boolean
          id: string
          logo_url: string | null
          max_agencies: number
          max_operations_per_month: number
          max_users: number
          mp_last_synced_at: string | null
          mp_preapproval_id: string | null
          name: string
          owner_id: string | null
          plan: string
          slug: string
          subscription_id: string | null
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          billing_name?: string | null
          brand_color?: string | null
          created_at?: string
          cuit?: string | null
          current_period_ends_at?: string | null
          custom_plan_id?: string | null
          features?: Json
          grace_period_ends_at?: string | null
          has_used_trial?: boolean
          id?: string
          logo_url?: string | null
          max_agencies?: number
          max_operations_per_month?: number
          max_users?: number
          mp_last_synced_at?: string | null
          mp_preapproval_id?: string | null
          name: string
          owner_id?: string | null
          plan?: string
          slug: string
          subscription_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          billing_name?: string | null
          brand_color?: string | null
          created_at?: string
          cuit?: string | null
          current_period_ends_at?: string | null
          custom_plan_id?: string | null
          features?: Json
          grace_period_ends_at?: string | null
          has_used_trial?: boolean
          id?: string
          logo_url?: string | null
          max_agencies?: number
          max_operations_per_month?: number
          max_users?: number
          mp_last_synced_at?: string | null
          mp_preapproval_id?: string | null
          name?: string
          owner_id?: string | null
          plan?: string
          slug?: string
          subscription_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_custom_plan_id_fkey"
            columns: ["custom_plan_id"]
            isOneToOne: false
            referencedRelation: "custom_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_accounts: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          org_id: string | null
          partner_name: string
          profit_percentage: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          org_id?: string | null
          partner_name: string
          profit_percentage?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          org_id?: string | null
          partner_name?: string
          profit_percentage?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_profit_allocations: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string
          exchange_rate: number | null
          id: string
          month: number
          monthly_position_id: string | null
          org_id: string | null
          partner_id: string
          profit_amount: number
          status: string
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          exchange_rate?: number | null
          id?: string
          month: number
          monthly_position_id?: string | null
          org_id?: string | null
          partner_id: string
          profit_amount: number
          status?: string
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          exchange_rate?: number | null
          id?: string
          month?: number
          monthly_position_id?: string | null
          org_id?: string | null
          partner_id?: string
          profit_amount?: number
          status?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_profit_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_profit_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_profit_allocations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_withdrawals: {
        Row: {
          account_id: string | null
          amount: number
          cash_movement_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          id: string
          ledger_movement_id: string | null
          movement_type: string
          partner_id: string
          withdrawal_date: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          cash_movement_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          ledger_movement_id?: string | null
          movement_type?: string
          partner_id: string
          withdrawal_date: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          cash_movement_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          ledger_movement_id?: string | null
          movement_type?: string
          partner_id?: string
          withdrawal_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_withdrawals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_withdrawals_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_withdrawals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_withdrawals_ledger_movement_id_fkey"
            columns: ["ledger_movement_id"]
            isOneToOne: false
            referencedRelation: "ledger_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_withdrawals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_coupons: {
        Row: {
          agency_id: string
          amount: number
          coupon_number: string
          coupon_type: string
          created_at: string | null
          created_by: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          description: string | null
          due_date: string
          id: string
          issue_date: string
          notes: string | null
          operation_id: string | null
          paid_date: string | null
          payment_id: string | null
          payment_reference: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          amount: number
          coupon_number: string
          coupon_type?: string
          created_at?: string | null
          created_by: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          description?: string | null
          due_date: string
          id?: string
          issue_date?: string
          notes?: string | null
          operation_id?: string | null
          paid_date?: string | null
          payment_id?: string | null
          payment_reference?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          amount?: number
          coupon_number?: string
          coupon_type?: string
          created_at?: string | null
          created_by?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          description?: string | null
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          operation_id?: string | null
          paid_date?: string | null
          payment_id?: string | null
          payment_reference?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_coupons_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_coupons_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_coupons_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_coupons_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_passenger_allocations: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          operation_customer_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          operation_customer_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          operation_customer_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_passenger_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_passenger_allocations_operation_customer_id_fkey"
            columns: ["operation_customer_id"]
            isOneToOne: false
            referencedRelation: "operation_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_passenger_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_usd: number | null
          created_at: string | null
          currency: string
          date_due: string
          date_paid: string | null
          direction: string
          exchange_rate: number | null
          id: string
          ledger_movement_id: string | null
          method: string
          operation_id: string
          operation_service_id: string | null
          operator_id: string | null
          operator_payment_id: string | null
          org_id: string | null
          payer_type: string
          reference: string | null
          source: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          amount_usd?: number | null
          created_at?: string | null
          currency?: string
          date_due: string
          date_paid?: string | null
          direction: string
          exchange_rate?: number | null
          id?: string
          ledger_movement_id?: string | null
          method: string
          operation_id: string
          operation_service_id?: string | null
          operator_id?: string | null
          operator_payment_id?: string | null
          org_id?: string | null
          payer_type: string
          reference?: string | null
          source?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          amount_usd?: number | null
          created_at?: string | null
          currency?: string
          date_due?: string
          date_paid?: string | null
          direction?: string
          exchange_rate?: number | null
          id?: string
          ledger_movement_id?: string | null
          method?: string
          operation_id?: string
          operation_service_id?: string | null
          operator_id?: string | null
          operator_payment_id?: string | null
          org_id?: string | null
          payer_type?: string
          reference?: string | null
          source?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_ledger_movement_id_fkey"
            columns: ["ledger_movement_id"]
            isOneToOne: false
            referencedRelation: "ledger_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_operation_service_id_fkey"
            columns: ["operation_service_id"]
            isOneToOne: false
            referencedRelation: "operation_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_operator_payment_id_fkey"
            columns: ["operator_payment_id"]
            isOneToOne: false
            referencedRelation: "operator_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_templates: {
        Row: {
          agency_id: string
          available_variables: Json | null
          created_at: string | null
          created_by: string | null
          css_styles: string | null
          description: string | null
          footer_html: string | null
          header_html: string | null
          html_content: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          logo_url: string | null
          name: string
          org_id: string
          page_margins: Json | null
          page_orientation: string | null
          page_size: string | null
          primary_color: string | null
          secondary_color: string | null
          show_page_numbers: boolean | null
          template_type: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          available_variables?: Json | null
          created_at?: string | null
          created_by?: string | null
          css_styles?: string | null
          description?: string | null
          footer_html?: string | null
          header_html?: string | null
          html_content: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          logo_url?: string | null
          name: string
          org_id: string
          page_margins?: Json | null
          page_orientation?: string | null
          page_size?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_page_numbers?: boolean | null
          template_type: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          available_variables?: Json | null
          created_at?: string | null
          created_by?: string | null
          css_styles?: string | null
          description?: string | null
          footer_html?: string | null
          header_html?: string | null
          html_content?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          logo_url?: string | null
          name?: string
          org_id?: string
          page_margins?: Json | null
          page_orientation?: string | null
          page_size?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_page_numbers?: boolean | null
          template_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdf_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string
          document_name: string | null
          document_url: string | null
          emitter_cuit: string
          emitter_name: string
          exchange_rate: number | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_type: string
          iva_amount: number
          iva_rate: number
          net_amount: number
          notes: string | null
          operation_id: string | null
          operator_id: string | null
          other_taxes: number | null
          perception_iibb: number | null
          perception_iva: number | null
          status: string
          total_amount: number
          total_ars_equivalent: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          document_name?: string | null
          document_url?: string | null
          emitter_cuit: string
          emitter_name: string
          exchange_rate?: number | null
          id?: string
          invoice_date: string
          invoice_number: string
          invoice_type?: string
          iva_amount?: number
          iva_rate?: number
          net_amount?: number
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          other_taxes?: number | null
          perception_iibb?: number | null
          perception_iva?: number | null
          status?: string
          total_amount?: number
          total_ars_equivalent?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          document_name?: string | null
          document_url?: string | null
          emitter_cuit?: string
          emitter_name?: string
          exchange_rate?: number | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string
          iva_amount?: number
          iva_rate?: number
          net_amount?: number
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          other_taxes?: number | null
          perception_iibb?: number | null
          perception_iva?: number | null
          status?: string
          total_amount?: number
          total_ars_equivalent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quota_reservations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          operation_id: string | null
          quantity: number
          quota_id: string
          quotation_id: string | null
          released_at: string | null
          reserved_until: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          operation_id?: string | null
          quantity: number
          quota_id: string
          quotation_id?: string | null
          released_at?: string | null
          reserved_until?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          operation_id?: string | null
          quantity?: number
          quota_id?: string
          quotation_id?: string | null
          released_at?: string | null
          reserved_until?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quota_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quota_reservations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quota_reservations_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quota_reservations_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotas: {
        Row: {
          accommodation_name: string | null
          available_quota: number | null
          created_at: string | null
          created_by: string | null
          date_from: string
          date_to: string
          destination: string
          id: string
          is_active: boolean | null
          notes: string | null
          operator_id: string
          reserved_quota: number | null
          room_type: string | null
          tariff_id: string | null
          total_quota: number
          updated_at: string | null
        }
        Insert: {
          accommodation_name?: string | null
          available_quota?: number | null
          created_at?: string | null
          created_by?: string | null
          date_from: string
          date_to: string
          destination: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          operator_id: string
          reserved_quota?: number | null
          room_type?: string | null
          tariff_id?: string | null
          total_quota: number
          updated_at?: string | null
        }
        Update: {
          accommodation_name?: string | null
          available_quota?: number | null
          created_at?: string | null
          created_by?: string | null
          date_from?: string
          date_to?: string
          destination?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          operator_id?: string
          reserved_quota?: number | null
          room_type?: string | null
          tariff_id?: string | null
          total_quota?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          airline: string | null
          checkin_date: string | null
          checkout_date: string | null
          cost_amount: number | null
          cost_currency: string | null
          created_at: string | null
          currency: string
          description: string
          destination_city: string | null
          discount_amount: number | null
          discount_percentage: number | null
          flight_class: string | null
          flight_date: string | null
          flight_return_date: string | null
          flight_route: string | null
          flight_screenshot_url: string | null
          flight_stops: number | null
          generates_commission: boolean | null
          hotel_address: string | null
          hotel_name: string | null
          hotel_phone: string | null
          hotel_photo_url: string | null
          hotel_stars: number | null
          id: string
          item_type: string
          meal_plan: string | null
          nights: number | null
          notes: string | null
          operator_id: string | null
          option_id: string | null
          order_index: number | null
          org_id: string | null
          provider: string | null
          quantity: number | null
          quotation_id: string
          room_type: string | null
          rooms: number | null
          sale_amount: number | null
          subtotal: number
          tariff_id: string | null
          transfer_description: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          airline?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string | null
          currency?: string
          description: string
          destination_city?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          flight_class?: string | null
          flight_date?: string | null
          flight_return_date?: string | null
          flight_route?: string | null
          flight_screenshot_url?: string | null
          flight_stops?: number | null
          generates_commission?: boolean | null
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          hotel_photo_url?: string | null
          hotel_stars?: number | null
          id?: string
          item_type: string
          meal_plan?: string | null
          nights?: number | null
          notes?: string | null
          operator_id?: string | null
          option_id?: string | null
          order_index?: number | null
          org_id?: string | null
          provider?: string | null
          quantity?: number | null
          quotation_id: string
          room_type?: string | null
          rooms?: number | null
          sale_amount?: number | null
          subtotal: number
          tariff_id?: string | null
          transfer_description?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          airline?: string | null
          checkin_date?: string | null
          checkout_date?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string | null
          currency?: string
          description?: string
          destination_city?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          flight_class?: string | null
          flight_date?: string | null
          flight_return_date?: string | null
          flight_route?: string | null
          flight_screenshot_url?: string | null
          flight_stops?: number | null
          generates_commission?: boolean | null
          hotel_address?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          hotel_photo_url?: string | null
          hotel_stars?: number | null
          id?: string
          item_type?: string
          meal_plan?: string | null
          nights?: number | null
          notes?: string | null
          operator_id?: string | null
          option_id?: string | null
          order_index?: number | null
          org_id?: string | null
          provider?: string | null
          quantity?: number | null
          quotation_id?: string
          room_type?: string | null
          rooms?: number | null
          sale_amount?: number | null
          subtotal?: number
          tariff_id?: string | null
          transfer_description?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "quotation_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_options: {
        Row: {
          calculated_total_amount: number | null
          created_at: string | null
          id: string
          is_selected: boolean | null
          manual_total_amount: number | null
          option_number: number
          quotation_id: string
          title: string
          total_amount: number
        }
        Insert: {
          calculated_total_amount?: number | null
          created_at?: string | null
          id?: string
          is_selected?: boolean | null
          manual_total_amount?: number | null
          option_number?: number
          quotation_id: string
          title: string
          total_amount: number
        }
        Update: {
          calculated_total_amount?: number | null
          created_at?: string | null
          id?: string
          is_selected?: boolean | null
          manual_total_amount?: number | null
          option_number?: number
          quotation_id?: string
          title?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_options_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          adults: number | null
          agency_id: string
          approved_at: string | null
          approved_by: string | null
          children: number | null
          converted_at: string | null
          created_at: string | null
          created_by: string
          currency: string
          customer_id: string | null
          departure_date: string
          destination: string
          discounts: number | null
          id: string
          infants: number | null
          lead_id: string | null
          notes: string | null
          operation_id: string | null
          operator_id: string | null
          org_id: string | null
          origin: string | null
          pricing_mode: string
          public_token: string | null
          quotation_number: string
          region: string
          rejection_reason: string | null
          return_date: string | null
          seller_id: string
          status: string
          subtotal: number
          taxes: number | null
          terms_and_conditions: string | null
          total_amount: number
          updated_at: string | null
          valid_until: string
        }
        Insert: {
          adults?: number | null
          agency_id: string
          approved_at?: string | null
          approved_by?: string | null
          children?: number | null
          converted_at?: string | null
          created_at?: string | null
          created_by: string
          currency?: string
          customer_id?: string | null
          departure_date: string
          destination: string
          discounts?: number | null
          id?: string
          infants?: number | null
          lead_id?: string | null
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          org_id?: string | null
          origin?: string | null
          pricing_mode?: string
          public_token?: string | null
          quotation_number: string
          region: string
          rejection_reason?: string | null
          return_date?: string | null
          seller_id: string
          status?: string
          subtotal?: number
          taxes?: number | null
          terms_and_conditions?: string | null
          total_amount: number
          updated_at?: string | null
          valid_until: string
        }
        Update: {
          adults?: number | null
          agency_id?: string
          approved_at?: string | null
          approved_by?: string | null
          children?: number | null
          converted_at?: string | null
          created_at?: string | null
          created_by?: string
          currency?: string
          customer_id?: string | null
          departure_date?: string
          destination?: string
          discounts?: number | null
          id?: string
          infants?: number | null
          lead_id?: string | null
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          org_id?: string | null
          origin?: string | null
          pricing_mode?: string
          public_token?: string | null
          quotation_number?: string
          region?: string
          rejection_reason?: string | null
          return_date?: string | null
          seller_id?: string
          status?: string
          subtotal?: number
          taxes?: number | null
          terms_and_conditions?: string | null
          total_amount?: number
          updated_at?: string | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_payment_categories: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_payment_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_payment_providers: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      recurring_payments: {
        Row: {
          agency_id: string | null
          amount: number
          category_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string
          end_date: string | null
          frequency: string
          id: string
          invoice_number: string | null
          is_active: boolean
          last_generated_date: string | null
          next_due_date: string
          notes: string | null
          org_id: string | null
          provider_name: string
          reference: string | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          agency_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency: string
          description: string
          end_date?: string | null
          frequency: string
          id?: string
          invoice_number?: string | null
          is_active?: boolean
          last_generated_date?: string | null
          next_due_date: string
          notes?: string | null
          org_id?: string | null
          provider_name: string
          reference?: string | null
          start_date: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string
          end_date?: string | null
          frequency?: string
          id?: string
          invoice_number?: string | null
          is_active?: boolean
          last_generated_date?: string | null
          next_due_date?: string
          notes?: string | null
          org_id?: string | null
          provider_name?: string
          reference?: string | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_payments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_payments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "recurring_payment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          actor_auth_id: string | null
          actor_org_id: string | null
          actor_user_id: string | null
          created_at: string
          details: Json | null
          event_type: string
          id: string
          request_ip: string | null
          request_path: string | null
          severity: string
          target_entity: string | null
          target_entity_id: string | null
          target_org_id: string | null
        }
        Insert: {
          actor_auth_id?: string | null
          actor_org_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          request_ip?: string | null
          request_path?: string | null
          severity: string
          target_entity?: string | null
          target_entity_id?: string | null
          target_org_id?: string | null
        }
        Update: {
          actor_auth_id?: string | null
          actor_org_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          request_ip?: string | null
          request_path?: string | null
          severity?: string
          target_entity?: string | null
          target_entity_id?: string | null
          target_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_log_actor_org_id_fkey"
            columns: ["actor_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_audit_log_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_objective_records: {
        Row: {
          achieved_at: string | null
          created_at: string
          current_value: number
          id: string
          is_achieved: boolean
          objective_id: string
          period_end: string
          period_start: string
          reward_amount: number | null
          reward_paid: boolean
          reward_paid_at: string | null
          seller_id: string
          target_value: number
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          current_value?: number
          id?: string
          is_achieved?: boolean
          objective_id: string
          period_end: string
          period_start: string
          reward_amount?: number | null
          reward_paid?: boolean
          reward_paid_at?: string | null
          seller_id: string
          target_value: number
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          current_value?: number
          id?: string
          is_achieved?: boolean
          objective_id?: string
          period_end?: string
          period_start?: string
          reward_amount?: number | null
          reward_paid?: boolean
          reward_paid_at?: string | null
          seller_id?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_objective_records_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "seller_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_objective_records_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_objectives: {
        Row: {
          agency_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          metric_type: string
          name: string
          period_type: string
          reward_currency: string | null
          reward_type: string
          reward_value: number
          seller_id: string | null
          target_currency: string | null
          target_value: number
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          metric_type: string
          name: string
          period_type?: string
          reward_currency?: string | null
          reward_type: string
          reward_value: number
          seller_id?: string | null
          target_currency?: string | null
          target_value: number
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          metric_type?: string
          name?: string
          period_type?: string
          reward_currency?: string | null
          reward_type?: string
          reward_value?: number
          seller_id?: string | null
          target_currency?: string | null
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_objectives_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_objectives_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_trello: {
        Row: {
          agency_id: string
          board_id: string
          created_at: string | null
          id: string
          last_sync_at: string | null
          list_region_mapping: Json
          list_status_mapping: Json
          org_id: string | null
          trello_api_key: string
          trello_token: string
          updated_at: string | null
          webhook_id: string | null
          webhook_url: string | null
        }
        Insert: {
          agency_id: string
          board_id: string
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          list_region_mapping?: Json
          list_status_mapping?: Json
          org_id?: string | null
          trello_api_key: string
          trello_token: string
          updated_at?: string | null
          webhook_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          agency_id?: string
          board_id?: string
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          list_region_mapping?: Json
          list_status_mapping?: Json
          org_id?: string | null
          trello_api_key?: string
          trello_token?: string
          updated_at?: string | null
          webhook_id?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_trello_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_trello_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tariff_items: {
        Row: {
          base_price: number
          category: string
          commission_percentage: number | null
          created_at: string | null
          discount_percentage: number | null
          id: string
          is_available: boolean | null
          max_nights: number | null
          max_pax: number | null
          min_nights: number | null
          min_pax: number | null
          notes: string | null
          occupancy_type: string | null
          order_index: number | null
          price_per_night: boolean | null
          price_per_person: boolean | null
          room_type: string | null
          tariff_id: string
          updated_at: string | null
        }
        Insert: {
          base_price: number
          category: string
          commission_percentage?: number | null
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          is_available?: boolean | null
          max_nights?: number | null
          max_pax?: number | null
          min_nights?: number | null
          min_pax?: number | null
          notes?: string | null
          occupancy_type?: string | null
          order_index?: number | null
          price_per_night?: boolean | null
          price_per_person?: boolean | null
          room_type?: string | null
          tariff_id: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category?: string
          commission_percentage?: number | null
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          is_available?: boolean | null
          max_nights?: number | null
          max_pax?: number | null
          min_nights?: number | null
          min_pax?: number | null
          notes?: string | null
          occupancy_type?: string | null
          order_index?: number | null
          price_per_night?: boolean | null
          price_per_person?: boolean | null
          room_type?: string | null
          tariff_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tariff_items_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tariffs"
            referencedColumns: ["id"]
          },
        ]
      }
      tariffs: {
        Row: {
          agency_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          destination: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          operator_id: string
          region: string
          tariff_type: string
          terms_and_conditions: string | null
          updated_at: string | null
          valid_from: string
          valid_to: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          destination: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          operator_id: string
          region: string
          tariff_type: string
          terms_and_conditions?: string | null
          updated_at?: string | null
          valid_from: string
          valid_to: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          destination?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          operator_id?: string
          region?: string
          tariff_type?: string
          terms_and_conditions?: string | null
          updated_at?: string | null
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "tariffs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tariffs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agency_id: string
          assigned_to: string
          completed_at: string | null
          created_at: string | null
          created_by: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          operation_id: string | null
          org_id: string | null
          priority: string
          reminder_minutes: number | null
          reminder_sent: boolean | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          assigned_to: string
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          operation_id?: string | null
          org_id?: string | null
          priority?: string
          reminder_minutes?: number | null
          reminder_sent?: boolean | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          assigned_to?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          operation_id?: string | null
          org_id?: string | null
          priority?: string
          reminder_minutes?: number | null
          reminder_sent?: boolean | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_withholdings: {
        Row: {
          agency_id: string | null
          amount: number
          counterpart_cuit: string | null
          counterpart_name: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          direction: string
          id: string
          notes: string | null
          operation_id: string | null
          operator_id: string | null
          org_id: string
          source_id: string | null
          source_type: string
          status: string
          tax_period: string | null
          type: string
          withholding_date: string
        }
        Insert: {
          agency_id?: string | null
          amount: number
          counterpart_cuit?: string | null
          counterpart_name?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          direction: string
          id?: string
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          org_id: string
          source_id?: string | null
          source_type: string
          status?: string
          tax_period?: string | null
          type: string
          withholding_date: string
        }
        Update: {
          agency_id?: string | null
          amount?: number
          counterpart_cuit?: string | null
          counterpart_name?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          direction?: string
          id?: string
          notes?: string | null
          operation_id?: string | null
          operator_id?: string | null
          org_id?: string
          source_id?: string | null
          source_type?: string
          status?: string
          tax_period?: string | null
          type?: string
          withholding_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_withholdings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_withholdings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_withholdings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_withholdings_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_withholdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_goals: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_margin: number | null
          current_new_customers: number | null
          current_operations: number | null
          current_revenue: number | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          period_type: string
          status: string | null
          target_margin: number | null
          target_new_customers: number | null
          target_operations: number | null
          target_revenue: number | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          current_margin?: number | null
          current_new_customers?: number | null
          current_operations?: number | null
          current_revenue?: number | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          period_type: string
          status?: string | null
          target_margin?: number | null
          target_new_customers?: number | null
          target_operations?: number | null
          target_revenue?: number | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          current_margin?: number | null
          current_new_customers?: number | null
          current_operations?: number | null
          current_revenue?: number | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          status?: string | null
          target_margin?: number | null
          target_new_customers?: number | null
          target_operations?: number | null
          target_revenue?: number | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string | null
          left_at: string | null
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          agency_id: string
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          leader_id: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tools_settings: {
        Row: {
          agency_id: string
          backups_enabled: boolean | null
          backups_frequency: string | null
          backups_include_attachments: boolean | null
          backups_retention_days: number | null
          created_at: string | null
          created_by: string | null
          email_enabled: boolean | null
          email_from_address: string | null
          email_from_name: string | null
          email_provider: string | null
          email_reply_to: string | null
          email_signature: string | null
          email_templates: Json | null
          emilia_allowed_actions: Json | null
          emilia_enabled: boolean | null
          emilia_max_tokens: number | null
          emilia_model: string | null
          emilia_system_prompt: string | null
          emilia_temperature: number | null
          export_company_info: Json | null
          export_currency_format: string | null
          export_date_format: string | null
          export_default_format: string | null
          export_include_headers: boolean | null
          export_logo_url: string | null
          id: string
          notifications_desktop: boolean | null
          notifications_digest_frequency: string | null
          notifications_email_digest: boolean | null
          notifications_enabled: boolean | null
          notifications_sound: boolean | null
          org_id: string | null
          ui_compact_mode: boolean | null
          ui_date_format: string | null
          ui_default_currency_display: string | null
          ui_language: string | null
          ui_show_tooltips: boolean | null
          ui_sidebar_collapsed: boolean | null
          ui_theme: string | null
          ui_time_format: string | null
          updated_at: string | null
          updated_by: string | null
          whatsapp_api_key: string | null
          whatsapp_default_country_code: string | null
          whatsapp_enabled: boolean | null
          whatsapp_provider: string | null
          whatsapp_templates: Json | null
        }
        Insert: {
          agency_id: string
          backups_enabled?: boolean | null
          backups_frequency?: string | null
          backups_include_attachments?: boolean | null
          backups_retention_days?: number | null
          created_at?: string | null
          created_by?: string | null
          email_enabled?: boolean | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          email_reply_to?: string | null
          email_signature?: string | null
          email_templates?: Json | null
          emilia_allowed_actions?: Json | null
          emilia_enabled?: boolean | null
          emilia_max_tokens?: number | null
          emilia_model?: string | null
          emilia_system_prompt?: string | null
          emilia_temperature?: number | null
          export_company_info?: Json | null
          export_currency_format?: string | null
          export_date_format?: string | null
          export_default_format?: string | null
          export_include_headers?: boolean | null
          export_logo_url?: string | null
          id?: string
          notifications_desktop?: boolean | null
          notifications_digest_frequency?: string | null
          notifications_email_digest?: boolean | null
          notifications_enabled?: boolean | null
          notifications_sound?: boolean | null
          org_id?: string | null
          ui_compact_mode?: boolean | null
          ui_date_format?: string | null
          ui_default_currency_display?: string | null
          ui_language?: string | null
          ui_show_tooltips?: boolean | null
          ui_sidebar_collapsed?: boolean | null
          ui_theme?: string | null
          ui_time_format?: string | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_api_key?: string | null
          whatsapp_default_country_code?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_provider?: string | null
          whatsapp_templates?: Json | null
        }
        Update: {
          agency_id?: string
          backups_enabled?: boolean | null
          backups_frequency?: string | null
          backups_include_attachments?: boolean | null
          backups_retention_days?: number | null
          created_at?: string | null
          created_by?: string | null
          email_enabled?: boolean | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          email_reply_to?: string | null
          email_signature?: string | null
          email_templates?: Json | null
          emilia_allowed_actions?: Json | null
          emilia_enabled?: boolean | null
          emilia_max_tokens?: number | null
          emilia_model?: string | null
          emilia_system_prompt?: string | null
          emilia_temperature?: number | null
          export_company_info?: Json | null
          export_currency_format?: string | null
          export_date_format?: string | null
          export_default_format?: string | null
          export_include_headers?: boolean | null
          export_logo_url?: string | null
          id?: string
          notifications_desktop?: boolean | null
          notifications_digest_frequency?: string | null
          notifications_email_digest?: boolean | null
          notifications_enabled?: boolean | null
          notifications_sound?: boolean | null
          org_id?: string | null
          ui_compact_mode?: boolean | null
          ui_date_format?: string | null
          ui_default_currency_display?: string | null
          ui_language?: string | null
          ui_show_tooltips?: boolean | null
          ui_sidebar_collapsed?: boolean | null
          ui_theme?: string | null
          ui_time_format?: string | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_api_key?: string | null
          whatsapp_default_country_code?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_provider?: string | null
          whatsapp_templates?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tools_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agencies: {
        Row: {
          agency_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agencies_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_agencies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goals: {
        Row: {
          agency_id: string
          created_at: string | null
          current_margin: number | null
          current_new_customers: number | null
          current_operations: number | null
          current_revenue: number | null
          id: string
          period_end: string
          period_start: string
          period_type: string
          status: string | null
          target_margin: number | null
          target_new_customers: number | null
          target_operations: number | null
          target_revenue: number | null
          team_goal_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string | null
          current_margin?: number | null
          current_new_customers?: number | null
          current_operations?: number | null
          current_revenue?: number | null
          id?: string
          period_end: string
          period_start: string
          period_type: string
          status?: string | null
          target_margin?: number | null
          target_new_customers?: number | null
          target_operations?: number | null
          target_revenue?: number | null
          team_goal_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string | null
          current_margin?: number | null
          current_new_customers?: number | null
          current_operations?: number | null
          current_revenue?: number | null
          id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          status?: string | null
          target_margin?: number | null
          target_new_customers?: number | null
          target_operations?: number | null
          target_revenue?: number | null
          team_goal_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_goals_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_goals_team_goal_id_fkey"
            columns: ["team_goal_id"]
            isOneToOne: false
            referencedRelation: "team_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string
          can_add_services_on_agency_operations: boolean
          can_view_agency_operations_support: boolean
          created_at: string | null
          default_commission_percentage: number | null
          email: string
          id: string
          is_active: boolean | null
          legal_accepted_at: string | null
          legal_version: string | null
          name: string
          org_id: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          auth_id: string
          can_add_services_on_agency_operations?: boolean
          can_view_agency_operations_support?: boolean
          created_at?: string | null
          default_commission_percentage?: number | null
          email: string
          id?: string
          is_active?: boolean | null
          legal_accepted_at?: string | null
          legal_version?: string | null
          name: string
          org_id?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          auth_id?: string
          can_add_services_on_agency_operations?: boolean
          can_view_agency_operations_support?: boolean
          created_at?: string | null
          default_commission_percentage?: number | null
          email?: string
          id?: string
          is_active?: boolean | null
          legal_accepted_at?: string | null
          legal_version?: string | null
          name?: string
          org_id?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auth_credentials: {
        Row: {
          creds: Json
          device_id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          creds: Json
          device_id: string
          org_id: string
          updated_at?: string
        }
        Update: {
          creds?: Json
          device_id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auth_credentials_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "wa_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_auth_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auth_keys: {
        Row: {
          category: string
          device_id: string
          id: string
          key_id: string
          org_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          category: string
          device_id: string
          id?: string
          key_id: string
          org_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          category?: string
          device_id?: string
          id?: string
          key_id?: string
          org_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "wa_auth_keys_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wa_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_auth_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_chats: {
        Row: {
          chat_type: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          device_id: string
          id: string
          is_archived: boolean
          is_group: boolean
          last_message_at: string | null
          last_message_preview: string | null
          metadata: Json
          org_id: string
          push_name: string | null
          remote_jid: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          chat_type?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          device_id: string
          id?: string
          is_archived?: boolean
          is_group?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          org_id: string
          push_name?: string | null
          remote_jid: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          chat_type?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          device_id?: string
          id?: string
          is_archived?: boolean
          is_group?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json
          org_id?: string
          push_name?: string | null
          remote_jid?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_chats_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wa_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_chats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_daily_metrics: {
        Row: {
          active_chats_count: number
          avg_first_response_seconds: number | null
          created_at: string
          device_id: string
          id: string
          inbound_count: number
          median_first_response_seconds: number | null
          metric_date: string
          new_chats_count: number
          org_id: string
          outbound_count: number
          responded_chats_count: number
          unanswered_chats_count: number
          updated_at: string
        }
        Insert: {
          active_chats_count?: number
          avg_first_response_seconds?: number | null
          created_at?: string
          device_id: string
          id?: string
          inbound_count?: number
          median_first_response_seconds?: number | null
          metric_date: string
          new_chats_count?: number
          org_id: string
          outbound_count?: number
          responded_chats_count?: number
          unanswered_chats_count?: number
          updated_at?: string
        }
        Update: {
          active_chats_count?: number
          avg_first_response_seconds?: number | null
          created_at?: string
          device_id?: string
          id?: string
          inbound_count?: number
          median_first_response_seconds?: number | null
          metric_date?: string
          new_chats_count?: number
          org_id?: string
          outbound_count?: number
          responded_chats_count?: number
          unanswered_chats_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_daily_metrics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wa_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_daily_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_devices: {
        Row: {
          agency_id: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          last_connection_at: string | null
          last_seen_event_at: string | null
          metadata: Json
          org_id: string
          phone_number: string | null
          qr_value: string | null
          status: string
          updated_at: string
          whatsapp_jid: string | null
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          last_connection_at?: string | null
          last_seen_event_at?: string | null
          metadata?: Json
          org_id: string
          phone_number?: string | null
          qr_value?: string | null
          status?: string
          updated_at?: string
          whatsapp_jid?: string | null
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          last_connection_at?: string | null
          last_seen_event_at?: string | null
          metadata?: Json
          org_id?: string
          phone_number?: string | null
          qr_value?: string | null
          status?: string
          updated_at?: string
          whatsapp_jid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_devices_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_devices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          body_text: string | null
          chat_id: string
          created_at: string
          device_id: string
          direction: string
          from_me: boolean
          id: string
          media_file_name: string | null
          media_mime_type: string | null
          media_url: string | null
          message_type: string
          org_id: string
          participant_jid: string | null
          quoted_message_id: string | null
          raw_payload: Json | null
          remote_jid: string
          sent_at: string
          wa_message_id: string
        }
        Insert: {
          body_text?: string | null
          chat_id: string
          created_at?: string
          device_id: string
          direction: string
          from_me?: boolean
          id?: string
          media_file_name?: string | null
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          org_id: string
          participant_jid?: string | null
          quoted_message_id?: string | null
          raw_payload?: Json | null
          remote_jid: string
          sent_at: string
          wa_message_id: string
        }
        Update: {
          body_text?: string | null
          chat_id?: string
          created_at?: string
          device_id?: string
          direction?: string
          from_me?: boolean
          id?: string
          media_file_name?: string | null
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          org_id?: string
          participant_jid?: string | null
          quoted_message_id?: string | null
          raw_payload?: Json | null
          remote_jid?: string
          sent_at?: string
          wa_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "wa_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "wa_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          agency_id: string | null
          channel: string
          created_at: string | null
          customer_id: string | null
          customer_name: string
          id: string
          message: string
          message_kind: string
          operation_id: string | null
          org_id: string | null
          payment_id: string | null
          phone: string | null
          quotation_id: string | null
          recipient_name: string | null
          recipient_user_id: string | null
          scheduled_for: string
          sent_at: string | null
          sent_by: string | null
          status: string | null
          template_id: string | null
          whatsapp_link: string | null
        }
        Insert: {
          agency_id?: string | null
          channel?: string
          created_at?: string | null
          customer_id?: string | null
          customer_name: string
          id?: string
          message: string
          message_kind?: string
          operation_id?: string | null
          org_id?: string | null
          payment_id?: string | null
          phone?: string | null
          quotation_id?: string | null
          recipient_name?: string | null
          recipient_user_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          template_id?: string | null
          whatsapp_link?: string | null
        }
        Update: {
          agency_id?: string | null
          channel?: string
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string
          id?: string
          message?: string
          message_kind?: string
          operation_id?: string | null
          org_id?: string | null
          payment_id?: string | null
          phone?: string | null
          quotation_id?: string | null
          recipient_name?: string | null
          recipient_user_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          template_id?: string | null
          whatsapp_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_cash_box_balance: { Args: { box_id: string }; Returns: number }
      cleanup_old_integration_logs: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      create_conversation_fast: {
        Args: { p_channel?: string; p_title: string; p_user_id: string }
        Returns: {
          created_at: string
          id: string
          state: string
          title: string
        }[]
      }
      execute_readonly_query: { Args: { query_text: string }; Returns: Json }
      expire_quotations: { Args: never; Returns: undefined }
      generate_coupon_number: { Args: never; Returns: string }
      generate_quotation_number:
        | { Args: never; Returns: string }
        | { Args: { p_org_id?: string }; Returns: string }
      get_org_role: {
        Args: { p_org_id: string; p_user_auth_id: string }
        Returns: string
      }
      get_user_org_id: { Args: { p_user_auth_id: string }; Returns: string }
      is_org_member: {
        Args: { p_org_id: string; p_user_auth_id: string }
        Returns: boolean
      }
      log_audit_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id?: string
          p_entity_type?: string
          p_user_id: string
        }
        Returns: string
      }
      replace_operation_operators: {
        Args: { p_operation_id: string; p_operators: Json }
        Returns: undefined
      }
      user_org_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      operation_service_type:
        | "SEAT"
        | "LUGGAGE"
        | "VISA"
        | "TRANSFER"
        | "ASSISTANCE"
        | "HOTEL"
        | "FLIGHT"
        | "EXCURSION"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      operation_service_type: [
        "SEAT",
        "LUGGAGE",
        "VISA",
        "TRANSFER",
        "ASSISTANCE",
        "HOTEL",
        "FLIGHT",
        "EXCURSION",
      ],
    },
  },
} as const
