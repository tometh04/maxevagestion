export class GrowthStudioAssetNotFoundError extends Error {
  constructor() {
    super("Imagen no encontrada")
    this.name = "GrowthStudioAssetNotFoundError"
  }
}

export class GrowthStudioAssetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GrowthStudioAssetValidationError"
  }
}

export class GrowthStudioAssetPersistenceError extends Error {
  constructor(message = "No se pudo guardar la imagen") {
    super(message)
    this.name = "GrowthStudioAssetPersistenceError"
  }
}
