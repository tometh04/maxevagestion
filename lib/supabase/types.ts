export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          auth_id: string
          org_id: string | null
          name: string
          email: string
          role: 'SUPER_ADMIN' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          is_active: boolean
          can_view_agency_operations_support: boolean
          can_add_services_on_agency_operations: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_id: string
          org_id?: string | null
          name: string
          email: string
          role: 'SUPER_ADMIN' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          is_active?: boolean
          can_view_agency_operations_support?: boolean
          can_add_services_on_agency_operations?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_id?: string
          org_id?: string | null
          name?: string
          email?: string
          role?: 'SUPER_ADMIN' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          is_active?: boolean
          can_view_agency_operations_support?: boolean
          can_add_services_on_agency_operations?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      agencies: {
        Row: {
          id: string
          org_id: string
          name: string
          city: string
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          city: string
          timezone: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          city?: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_agencies: {
        Row: {
          id: string
          user_id: string
          agency_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          agency_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          agency_id?: string
          created_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          agency_id: string
          source: 'Instagram' | 'WhatsApp' | 'Meta Ads' | 'Other' | 'Trello'
          external_id: string | null
          trello_url: string | null
          trello_list_id: string | null
          trello_full_data: Record<string, any> | null
          status: 'NEW' | 'IN_PROGRESS' | 'QUOTED' | 'WON' | 'LOST'
          region: 'ARGENTINA' | 'CARIBE' | 'BRASIL' | 'EUROPA' | 'EEUU' | 'OTROS' | 'CRUCEROS'
          destination: string
          contact_name: string
          contact_phone: string
          contact_email: string | null
          contact_instagram: string | null
          assigned_seller_id: string | null
          notes: string | null
          quoted_price: number | null
          has_deposit: boolean
          deposit_amount: number | null
          deposit_currency: 'ARS' | 'USD' | null
          deposit_method: string | null
          deposit_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          source?: 'Instagram' | 'WhatsApp' | 'Meta Ads' | 'Other' | 'Trello'
          external_id?: string | null
          trello_url?: string | null
          trello_list_id?: string | null
          trello_full_data?: Record<string, any> | null
          status?: 'NEW' | 'IN_PROGRESS' | 'QUOTED' | 'WON' | 'LOST'
          region: 'ARGENTINA' | 'CARIBE' | 'BRASIL' | 'EUROPA' | 'EEUU' | 'OTROS' | 'CRUCEROS'
          destination: string
          contact_name: string
          contact_phone: string
          contact_email?: string | null
          contact_instagram?: string | null
          assigned_seller_id?: string | null
          notes?: string | null
          quoted_price?: number | null
          has_deposit?: boolean
          deposit_amount?: number | null
          deposit_currency?: 'ARS' | 'USD' | null
          deposit_method?: string | null
          deposit_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          source?: 'Instagram' | 'WhatsApp' | 'Meta Ads' | 'Other'
          external_id?: string | null
          trello_url?: string | null
          status?: 'NEW' | 'IN_PROGRESS' | 'QUOTED' | 'WON' | 'LOST'
          region?: 'ARGENTINA' | 'CARIBE' | 'BRASIL' | 'EUROPA' | 'EEUU' | 'OTROS' | 'CRUCEROS'
          destination?: string
          contact_name?: string
          contact_phone?: string
          contact_email?: string | null
          contact_instagram?: string | null
          assigned_seller_id?: string | null
          notes?: string | null
          quoted_price?: number | null
          has_deposit?: boolean
          deposit_amount?: number | null
          deposit_currency?: 'ARS' | 'USD' | null
          deposit_method?: string | null
          deposit_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          org_id: string
          first_name: string
          last_name: string
          phone: string
          email: string
          instagram_handle: string | null
          document_type: string | null
          document_number: string | null
          date_of_birth: string | null
          nationality: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          first_name: string
          last_name: string
          phone: string
          email: string
          instagram_handle?: string | null
          document_type?: string | null
          document_number?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          first_name?: string
          last_name?: string
          phone?: string
          email?: string
          instagram_handle?: string | null
          document_type?: string | null
          document_number?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      operations: {
        Row: {
          id: string
          agency_id: string
          lead_id: string | null
          seller_id: string
          operator_id: string | null
          type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'CRUISE' | 'TRANSFER' | 'MIXED' | 'ASSISTANCE'
          origin: string | null
          destination: string
          departure_date: string
          return_date: string | null
          adults: number
          children: number
          infants: number
          status: 'PRE_RESERVATION' | 'RESERVED' | 'CONFIRMED' | 'CANCELLED' | 'TRAVELLED' | 'CLOSED'
          sale_amount_total: number
          operator_cost: number
          currency: string
          margin_amount: number
          margin_percentage: number
          file_code: string | null
          product_type: 'AEREO' | 'HOTEL' | 'PAQUETE' | 'CRUCERO' | 'OTRO' | null
          checkin_date: string | null
          checkout_date: string | null
          passengers: Record<string, any> | null
          seller_secondary_id: string | null
          sale_currency: 'ARS' | 'USD'
          operator_cost_currency: 'ARS' | 'USD'
          reservation_code_air: string | null
          reservation_code_hotel: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          lead_id?: string | null
          seller_id: string
          operator_id?: string | null
          type: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'CRUISE' | 'TRANSFER' | 'MIXED' | 'ASSISTANCE'
          origin?: string | null
          destination: string
          departure_date: string
          return_date?: string | null
          adults?: number
          children?: number
          infants?: number
          status?: 'PRE_RESERVATION' | 'RESERVED' | 'CONFIRMED' | 'CANCELLED' | 'TRAVELLED' | 'CLOSED'
          sale_amount_total: number
          operator_cost: number
          currency: string
          margin_amount: number
          margin_percentage: number
          file_code?: string | null
          product_type?: 'AEREO' | 'HOTEL' | 'PAQUETE' | 'CRUCERO' | 'OTRO' | null
          checkin_date?: string | null
          checkout_date?: string | null
          passengers?: Record<string, any> | null
          seller_secondary_id?: string | null
          sale_currency?: 'ARS' | 'USD'
          operator_cost_currency?: 'ARS' | 'USD'
          reservation_code_air?: string | null
          reservation_code_hotel?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          lead_id?: string | null
          seller_id?: string
          operator_id?: string | null
          type?: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'CRUISE' | 'TRANSFER' | 'MIXED'
          origin?: string | null
          destination?: string
          departure_date?: string
          return_date?: string | null
          adults?: number
          children?: number
          infants?: number
          status?: 'PRE_RESERVATION' | 'RESERVED' | 'CONFIRMED' | 'CANCELLED' | 'TRAVELLED' | 'CLOSED'
          sale_amount_total?: number
          operator_cost?: number
          currency?: string
          margin_amount?: number
          margin_percentage?: number
          file_code?: string | null
          product_type?: 'AEREO' | 'HOTEL' | 'PAQUETE' | 'CRUCERO' | 'OTRO' | null
          checkin_date?: string | null
          checkout_date?: string | null
          passengers?: Record<string, any> | null
          seller_secondary_id?: string | null
          sale_currency?: 'ARS' | 'USD'
          operator_cost_currency?: 'ARS' | 'USD'
          reservation_code_air?: string | null
          reservation_code_hotel?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      operation_customers: {
        Row: {
          id: string
          operation_id: string
          customer_id: string
          role: 'MAIN' | 'COMPANION'
        }
        Insert: {
          id?: string
          operation_id: string
          customer_id: string
          role?: 'MAIN' | 'COMPANION'
        }
        Update: {
          id?: string
          operation_id?: string
          customer_id?: string
          role?: 'MAIN' | 'COMPANION'
        }
      }
      payments: {
        Row: {
          id: string
          operation_id: string
          operator_id: string | null
          operator_payment_id: string | null
          source: 'MANUAL' | 'OPERATOR_BULK'
          payer_type: 'CUSTOMER' | 'OPERATOR'
          direction: 'INCOME' | 'EXPENSE'
          method: string
          amount: number
          currency: string
          date_due: string
          date_paid: string | null
          status: 'PENDING' | 'PAID' | 'OVERDUE'
          reference: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          operation_id: string
          operator_id?: string | null
          operator_payment_id?: string | null
          source?: 'MANUAL' | 'OPERATOR_BULK'
          payer_type: 'CUSTOMER' | 'OPERATOR'
          direction: 'INCOME' | 'EXPENSE'
          method: string
          amount: number
          currency: string
          date_due: string
          date_paid?: string | null
          status?: 'PENDING' | 'PAID' | 'OVERDUE'
          reference?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          operation_id?: string
          operator_id?: string | null
          operator_payment_id?: string | null
          source?: 'MANUAL' | 'OPERATOR_BULK'
          payer_type?: 'CUSTOMER' | 'OPERATOR'
          direction?: 'INCOME' | 'EXPENSE'
          method?: string
          amount?: number
          currency?: string
          date_due?: string
          date_paid?: string | null
          status?: 'PENDING' | 'PAID' | 'OVERDUE'
          reference?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      cash_movements: {
        Row: {
          id: string
          operation_id: string | null
          user_id: string
          type: 'INCOME' | 'EXPENSE'
          category: string
          amount: number
          currency: string
          movement_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          operation_id?: string | null
          user_id: string
          type: 'INCOME' | 'EXPENSE'
          category: string
          amount: number
          currency: string
          movement_date: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          operation_id?: string | null
          user_id?: string
          type?: 'INCOME' | 'EXPENSE'
          category?: string
          amount?: number
          currency?: string
          movement_date?: string
          notes?: string | null
          created_at?: string
        }
      }
      operators: {
        Row: {
          id: string
          org_id: string
          name: string
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          credit_limit: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          credit_limit?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          credit_limit?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      operator_payments: {
        Row: {
          id: string
          operation_id: string
          operator_id: string
          amount: number
          paid_amount: number
          currency: 'ARS' | 'USD'
          due_date: string
          status: 'PENDING' | 'PAID' | 'OVERDUE'
          ledger_movement_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          operation_id: string
          operator_id: string
          amount: number
          paid_amount?: number
          currency: 'ARS' | 'USD'
          due_date: string
          status?: 'PENDING' | 'PAID' | 'OVERDUE'
          ledger_movement_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          operation_id?: string
          operator_id?: string
          amount?: number
          paid_amount?: number
          currency?: 'ARS' | 'USD'
          due_date?: string
          status?: 'PENDING' | 'PAID' | 'OVERDUE'
          ledger_movement_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      commission_rules: {
        Row: {
          id: string
          type: 'SELLER' | 'AGENCY'
          basis: 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'
          value: number
          destination_region: string | null
          agency_id: string | null
          valid_from: string
          valid_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: 'SELLER' | 'AGENCY'
          basis: 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'
          value: number
          destination_region?: string | null
          agency_id?: string | null
          valid_from: string
          valid_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          type?: 'SELLER' | 'AGENCY'
          basis?: 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'
          value?: number
          destination_region?: string | null
          agency_id?: string | null
          valid_from?: string
          valid_to?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      commission_records: {
        Row: {
          id: string
          operation_id: string
          seller_id: string
          agency_id: string | null
          amount: number
          percentage: number | null
          status: 'PENDING' | 'PAID'
          date_calculated: string
          date_paid: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          operation_id: string
          seller_id: string
          agency_id?: string | null
          amount: number
          percentage?: number | null
          status?: 'PENDING' | 'PAID'
          date_calculated: string
          date_paid?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          operation_id?: string
          seller_id?: string
          agency_id?: string | null
          amount?: number
          percentage?: number | null
          status?: 'PENDING' | 'PAID'
          date_calculated?: string
          date_paid?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          operation_id: string | null
          customer_id: string | null
          lead_id: string | null
          type: 'PASSPORT' | 'DNI' | 'LICENSE' | 'VOUCHER' | 'INVOICE' | 'PAYMENT_PROOF' | 'OTHER'
          file_url: string
          scanned_data: Record<string, any> | null
          uploaded_by_user_id: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          operation_id?: string | null
          customer_id?: string | null
          lead_id?: string | null
          type: 'PASSPORT' | 'DNI' | 'LICENSE' | 'VOUCHER' | 'INVOICE' | 'PAYMENT_PROOF' | 'OTHER'
          file_url: string
          scanned_data?: Record<string, any> | null
          uploaded_by_user_id: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          operation_id?: string | null
          customer_id?: string | null
          lead_id?: string | null
          type?: 'PASSPORT' | 'DNI' | 'LICENSE' | 'VOUCHER' | 'INVOICE' | 'PAYMENT_PROOF' | 'OTHER'
          file_url?: string
          scanned_data?: Record<string, any> | null
          uploaded_by_user_id?: string
          uploaded_at?: string
        }
      }
      alerts: {
        Row: {
          id: string
          org_id: string | null
          operation_id: string | null
          customer_id: string | null
          user_id: string | null
          type: 'PAYMENT_DUE' | 'OPERATOR_DUE' | 'UPCOMING_TRIP' | 'MISSING_DOC' | 'GENERIC'
          description: string
          date_due: string
          status: 'PENDING' | 'DONE' | 'IGNORED'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string | null
          operation_id?: string | null
          customer_id?: string | null
          user_id?: string | null
          type: 'PAYMENT_DUE' | 'OPERATOR_DUE' | 'UPCOMING_TRIP' | 'MISSING_DOC' | 'GENERIC'
          description: string
          date_due: string
          status?: 'PENDING' | 'DONE' | 'IGNORED'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string | null
          operation_id?: string | null
          customer_id?: string | null
          user_id?: string | null
          type?: 'PAYMENT_DUE' | 'OPERATOR_DUE' | 'UPCOMING_TRIP' | 'MISSING_DOC' | 'GENERIC'
          description?: string
          date_due?: string
          status?: 'PENDING' | 'DONE' | 'IGNORED'
          created_at?: string
          updated_at?: string
        }
      }
      settings_trello: {
        Row: {
          id: string
          agency_id: string
          trello_api_key: string
          trello_token: string
          board_id: string
          list_status_mapping: Json
          list_region_mapping: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          trello_api_key: string
          trello_token: string
          board_id: string
          list_status_mapping: Json
          list_region_mapping: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          trello_api_key?: string
          trello_token?: string
          board_id?: string
          list_status_mapping?: Json
          list_region_mapping?: Json
          created_at?: string
          updated_at?: string
        }
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          owner_id: string | null
          plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
          subscription_status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED'
          subscription_id: string | null
          trial_ends_at: string | null
          grace_period_ends_at: string | null
          max_users: number
          max_agencies: number
          max_operations_per_month: number
          features: Json
          billing_email: string | null
          billing_name: string | null
          cuit: string | null
          logo_url: string | null
          brand_color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          owner_id?: string | null
          plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
          subscription_status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED'
          subscription_id?: string | null
          trial_ends_at?: string | null
          grace_period_ends_at?: string | null
          max_users?: number
          max_agencies?: number
          max_operations_per_month?: number
          features?: Json
          billing_email?: string | null
          billing_name?: string | null
          cuit?: string | null
          logo_url?: string | null
          brand_color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          owner_id?: string | null
          plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
          subscription_status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED'
          subscription_id?: string | null
          trial_ends_at?: string | null
          grace_period_ends_at?: string | null
          max_users?: number
          max_agencies?: number
          max_operations_per_month?: number
          features?: Json
          billing_email?: string | null
          billing_name?: string | null
          cuit?: string | null
          logo_url?: string | null
          brand_color?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'OWNER' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          invited_by: string | null
          status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: 'OWNER' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          invited_by?: string | null
          status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: 'OWNER' | 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          invited_by?: string | null
          status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
          created_at?: string
          updated_at?: string
        }
      }
      organization_invitations: {
        Row: {
          id: string
          organization_id: string
          email: string
          role: 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          token: string
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          email: string
          role?: 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          status?: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          email?: string
          role?: 'ADMIN' | 'CONTABLE' | 'SELLER' | 'VIEWER'
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          status?: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

