"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ChevronDown } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableViewOptions } from "./data-table-view-options"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  showPagination?: boolean // Si es false, no muestra la paginación client-side
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Buscar...",
  showPagination = true,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => {
      // Hide searchText column by default if it exists
      if (searchKey) {
        return { [searchKey]: false }
      }
      return {}
    })
  const [rowSelection, setRowSelection] = React.useState({})
  const [searchInput, setSearchInput] = React.useState("")
  
  // Debounce para búsqueda (300ms - más responsivo para texto)
  const debouncedSearch = useDebounce(searchInput, 300)

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    // Cuando showPagination=false (paginación server-side), mostrar todas las filas
    ...(!showPagination && {
      initialState: {
        pagination: {
          pageSize: 999,
        },
      },
    }),
  })

  // Actualizar filtro cuando cambie el valor debounced
  React.useEffect(() => {
    if (searchKey) {
      table.getColumn(searchKey)?.setFilterValue(debouncedSearch)
    }
  }, [debouncedSearch, searchKey, table])

  // Sticky horizontal scrollbar: sync a bottom-sticky scrollbar with the table
  const tableScrollRef = React.useRef<HTMLDivElement>(null)
  const stickyScrollRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = React.useState(0)
  const [showStickyScroll, setShowStickyScroll] = React.useState(false)
  const syncing = React.useRef(false)

  // Measure scroll width and check if we need sticky scrollbar
  React.useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const check = () => {
      setScrollWidth(el.scrollWidth)
      setShowStickyScroll(el.scrollWidth > el.clientWidth)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [data, columnVisibility])

  // Sync scrolls
  const onTableScroll = React.useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    if (stickyScrollRef.current && tableScrollRef.current) {
      stickyScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft
    }
    syncing.current = false
  }, [])

  const onStickyScroll = React.useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    if (tableScrollRef.current && stickyScrollRef.current) {
      tableScrollRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
    }
    syncing.current = false
  }, [])

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {searchKey && (
          <Input
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        )}
        <DataTableViewOptions table={table} />
      </div>
      <div className="rounded-md border overflow-hidden">
        <div
          ref={tableScrollRef}
          className="overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
          onScroll={onTableScroll}
        >
          <Table className="min-w-[800px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="align-top">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No hay resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>
      {/* Sticky horizontal scrollbar */}
      {showStickyScroll && (
        <div
          ref={stickyScrollRef}
          className="sticky bottom-0 z-10 overflow-x-auto bg-background/80 backdrop-blur-sm border-t"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
          onScroll={onStickyScroll}
        >
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      )}
      {showPagination && <DataTablePagination table={table} />}
    </div>
  )
}

