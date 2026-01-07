"use client"

import { Control } from "react-hook-form"
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CustomField } from "@/hooks/use-customer-settings"

interface CustomFieldsFormProps {
  control: Control<any>
  customFields: CustomField[]
}

export function CustomFieldsForm({ control, customFields }: CustomFieldsFormProps) {
  if (!customFields || customFields.length === 0) {
    return null
  }

  return (
    <>
      {customFields.map((field) => (
        <FormField
          key={field.name}
          control={control}
          name={field.name}
          rules={{
            required: field.required ? `${field.label} es requerido` : false,
          }}
          render={({ field: formField }) => {
            // Renderizar según el tipo de campo
            switch (field.type) {
              case 'textarea':
                return (
                  <FormItem>
                    <FormLabel>
                      {field.label} {field.required && '*'}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={field.label}
                        {...formField}
                        value={formField.value || field.default_value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )

              case 'select':
                return (
                  <FormItem>
                    <FormLabel>
                      {field.label} {field.required && '*'}
                    </FormLabel>
                    <Select
                      onValueChange={formField.onChange}
                      value={formField.value || field.default_value || ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={`Seleccionar ${field.label}`} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {field.options?.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )

              case 'date':
                return (
                  <FormItem>
                    <FormLabel>
                      {field.label} {field.required && '*'}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...formField}
                        value={formField.value || field.default_value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )

              case 'number':
                return (
                  <FormItem>
                    <FormLabel>
                      {field.label} {field.required && '*'}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={field.label}
                        {...formField}
                        value={formField.value || field.default_value || ''}
                        onChange={(e) => formField.onChange(parseFloat(e.target.value) || '')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )

              default:
                return (
                  <FormItem>
                    <FormLabel>
                      {field.label} {field.required && '*'}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                        placeholder={field.label}
                        {...formField}
                        value={formField.value || field.default_value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
            }
          }}
        />
      ))}
    </>
  )
}

