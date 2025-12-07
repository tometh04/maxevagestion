import { NextResponse } from "next/server"

/**
 * POST /api/trello/validate
 * Valida las credenciales de Trello (API key + token) antes de guardar
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { apiKey, token, boardId } = body

    if (!apiKey || !token) {
      return NextResponse.json({ 
        valid: false, 
        error: "API Key y Token son requeridos" 
      }, { status: 400 })
    }

    // 1. Validar credenciales básicas - intentar obtener información del usuario
    try {
      const memberResponse = await fetch(
        `https://api.trello.com/1/members/me?key=${apiKey}&token=${token}&fields=id,username,fullName,email`
      )

      if (!memberResponse.ok) {
        const errorText = await memberResponse.text()
        let errorMessage = "Credenciales inválidas"
        
        if (memberResponse.status === 401) {
          errorMessage = "API Key o Token incorrectos"
        } else if (memberResponse.status === 429) {
          errorMessage = "Demasiadas solicitudes. Intenta más tarde"
        } else {
          errorMessage = `Error de Trello: ${memberResponse.status} - ${errorText}`
        }

        return NextResponse.json({ 
          valid: false, 
          error: errorMessage,
          statusCode: memberResponse.status
        })
      }

      const memberData = await memberResponse.json()
      
      // 2. Si hay boardId, validar que existe y que el usuario tiene acceso
      if (boardId) {
        try {
          const boardResponse = await fetch(
            `https://api.trello.com/1/boards/${boardId}?key=${apiKey}&token=${token}&fields=id,name,closed,url`
          )

          if (!boardResponse.ok) {
            const errorText = await boardResponse.text()
            let errorMessage = "Board ID inválido o sin acceso"
            
            if (boardResponse.status === 404) {
              errorMessage = "Board no encontrado. Verifica el Board ID"
            } else if (boardResponse.status === 401) {
              errorMessage = "No tienes acceso a este board"
            } else if (boardResponse.status === 429) {
              errorMessage = "Demasiadas solicitudes. Intenta más tarde"
            } else {
              errorMessage = `Error al validar board: ${boardResponse.status} - ${errorText}`
            }

            return NextResponse.json({ 
              valid: false, 
              error: errorMessage,
              boardValid: false,
              statusCode: boardResponse.status
            })
          }

          const boardData = await boardResponse.json()
          
          if (boardData.closed) {
            return NextResponse.json({ 
              valid: false, 
              error: "El board está cerrado. Usa un board activo",
              boardValid: false
            })
          }

          // 3. Obtener listas del board para verificar acceso
          const listsResponse = await fetch(
            `https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${token}&fields=id,name,closed`
          )

          if (!listsResponse.ok) {
            return NextResponse.json({ 
              valid: false, 
              error: "No se pudieron obtener las listas del board",
              boardValid: false,
              statusCode: listsResponse.status
            })
          }

          const lists = await listsResponse.json()
          const activeLists = lists.filter((l: any) => !l.closed)

          return NextResponse.json({
            valid: true,
            member: {
              id: memberData.id,
              username: memberData.username,
              fullName: memberData.fullName,
              email: memberData.email,
            },
            board: {
              id: boardData.id,
              name: boardData.name,
              url: boardData.url,
            },
            listsCount: activeLists.length,
            message: `✅ Credenciales válidas. Board "${boardData.name}" tiene ${activeLists.length} listas activas.`
          })

        } catch (boardError: any) {
          return NextResponse.json({ 
            valid: false, 
            error: `Error al validar board: ${boardError.message}`,
            boardValid: false
          })
        }
      }

      // Si no hay boardId, solo validar credenciales
      return NextResponse.json({
        valid: true,
        member: {
          id: memberData.id,
          username: memberData.username,
          fullName: memberData.fullName,
          email: memberData.email,
        },
        message: "✅ Credenciales válidas"
      })

    } catch (error: any) {
      console.error("Error validating Trello credentials:", error)
      return NextResponse.json({ 
        valid: false, 
        error: `Error al validar credenciales: ${error.message}` 
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error("Error in POST /api/trello/validate:", error)
    return NextResponse.json({ 
      valid: false, 
      error: "Error al procesar la validación" 
    }, { status: 500 })
  }
}

