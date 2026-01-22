import type { PluginConfigSchema, BBox } from '../../types';

/**
 * Entity types that OCR blocks can be classified as.
 * These correspond to semantic document structure elements.
 */
export type ClassifiableEntityType = 
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'header'
  | 'footer';

/**
 * Payload returned by classification commands.
 * The host (inspector page) uses this to create new entities.
 */
export interface EntityCreationPayload {
  /** Action discriminator for the host to handle */
  action: 'create_entity';
  /** The entity to create */
  entity: {
    /** Entity type (paragraph, heading, etc.) */
    type: ClassifiableEntityType;
    /** Bounding box in VDOM scale (0-1000) */
    bbox: BBox;
    /** Page number (1-indexed) */
    pageNumber: number;
    /** ID of the OCR block being classified (for reference) */
    sourceBlockId: string;
    /** Optional title/label for the entity */
    title?: string;
    /** For headings: level 1-6 */
    level?: number;
  };
}

/**
 * Plugin configuration (minimal for now)
 */
export interface OcrClassifierConfig {
  /** Whether to auto-expand to adjacent blocks with same classification */
  autoExpandSelection: boolean;
}

export const ocrClassifierConfigSchema: PluginConfigSchema = {
  autoExpandSelection: {
    type: 'boolean',
    default: false,
    label: 'Auto-expand Selection',
    description: 'Automatically include adjacent OCR blocks when classifying',
  },
};
