const { Op } = require('sequelize');
const constants = require('./constants');

/**
 * Pagination helper class
 */
class PaginationHelper {
  /**
   * Generate pagination metadata
   */
  static generateMetadata(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    
    return {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    };
  }

  /**
   * Parse pagination query parameters
   */
  static parseQuery(query = {}) {
    const {
      page = constants.PAGINATION.DEFAULT_PAGE,
      limit = constants.PAGINATION.DEFAULT_LIMIT,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      cursor,
      before,
      after,
    } = query;

    // Validate and sanitize values
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(
      Math.max(1, parseInt(limit)),
      constants.PAGINATION.MAX_LIMIT
    );

    // Validate sort order
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    return {
      page: pageNum,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      sortBy,
      sortOrder: order,
      cursor,
      before,
      after,
    };
  }

  /**
   * Apply pagination to Sequelize query
   */
  static applyPagination(queryOptions, paginationParams) {
    const { page, limit, offset, sortBy, sortOrder } = paginationParams;

    return {
      ...queryOptions,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
    };
  }

  /**
   * Apply cursor-based pagination
   */
  static applyCursorPagination(queryOptions, cursorParams, cursorField = 'id') {
    const { cursor, before, after, limit, sortOrder } = cursorParams;

    let where = queryOptions.where || {};
    const order = [];

    if (cursor) {
      // Simple cursor pagination
      where[cursorField] = {
        [Op.gt]: cursor,
      };
      order.push([cursorField, 'ASC']);
    } else if (before) {
      // Get previous page
      where[cursorField] = {
        [Op.lt]: before,
      };
      order.push([cursorField, 'DESC']);
    } else if (after) {
      // Get next page
      where[cursorField] = {
        [Op.gt]: after,
      };
      order.push([cursorField, 'ASC']);
    } else {
      // First page
      order.push([cursorField, sortOrder || 'DESC']);
    }

    return {
      ...queryOptions,
      where,
      limit,
      order,
    };
  }

  /**
   * Format paginated response
   */
  static formatResponse(data, paginationParams, total = null) {
    const { page, limit } = paginationParams;
    
    if (Array.isArray(data)) {
      const items = data;
      const count = total !== null ? total : items.length;
      
      return {
        items,
        pagination: this.generateMetadata(count, page, limit),
      };
    }

    if (data.rows && data.count !== undefined) {
      const { rows: items, count } = data;
      
      return {
        items,
        pagination: this.generateMetadata(count, page, limit),
      };
    }

    // If data is already an object with items
    if (data.items && data.pagination) {
      return data;
    }

    throw new Error('Invalid data format for pagination');
  }

  /**
   * Format cursor-based paginated response
   */
  static formatCursorResponse(items, cursorParams, cursorField = 'id') {
    const { limit } = cursorParams;
    
    if (!items || items.length === 0) {
      return {
        items: [],
        cursor: null,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    const hasNextPage = items.length === limit;
    const hasPrevPage = false; // For simple cursor, we don't track previous

    // Get next cursor (last item's cursor field)
    const lastItem = items[items.length - 1];
    const nextCursor = lastItem ? lastItem[cursorField] : null;

    return {
      items,
      cursor: nextCursor,
      hasNextPage,
      hasPrevPage,
    };
  }

  /**
   * Generate pagination links for HATEOAS
   */
  static generateLinks(baseUrl, paginationMetadata, queryParams = {}) {
    const { page, totalPages, hasNextPage, hasPrevPage, nextPage, prevPage } = paginationMetadata;
    
    const links = {
      self: this.buildUrl(baseUrl, page, queryParams),
      first: this.buildUrl(baseUrl, 1, queryParams),
      last: this.buildUrl(baseUrl, totalPages, queryParams),
    };

    if (hasPrevPage) {
      links.prev = this.buildUrl(baseUrl, prevPage, queryParams);
    }

    if (hasNextPage) {
      links.next = this.buildUrl(baseUrl, nextPage, queryParams);
    }

    return links;
  }

  /**
   * Build URL with query parameters
   */
  static buildUrl(baseUrl, page, queryParams) {
    const params = new URLSearchParams({
      ...queryParams,
      page: page.toString(),
    });

    // Remove page from queryParams if it's null/undefined
    if (page === null || page === undefined) {
      params.delete('page');
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Generate pagination headers for HTTP response
   */
  static generateHeaders(paginationMetadata) {
    const headers = {
      'X-Pagination-Total': paginationMetadata.total.toString(),
      'X-Pagination-Page': paginationMetadata.page.toString(),
      'X-Pagination-Limit': paginationMetadata.limit.toString(),
      'X-Pagination-Pages': paginationMetadata.totalPages.toString(),
    };

    if (paginationMetadata.hasNextPage) {
      headers['X-Pagination-Next-Page'] = paginationMetadata.nextPage.toString();
    }

    if (paginationMetadata.hasPrevPage) {
      headers['X-Pagination-Prev-Page'] = paginationMetadata.prevPage.toString();
    }

    return headers;
  }

  /**
   * Handle infinite scroll pagination
   */
  static handleInfiniteScroll(items, paginationParams, lastId = null) {
    const { limit } = paginationParams;
    
    const hasMore = items.length === limit;
    const nextId = hasMore ? items[items.length - 1].id : null;

    return {
      items,
      hasMore,
      nextId,
      lastId,
    };
  }

  /**
   * Generate offset for infinite scroll
   */
  static getInfiniteScrollOffset(lastId, itemsPerPage = 10) {
    // This is a simplified version - in real implementation,
    // you would query the database to find the offset based on lastId
    return lastId ? parseInt(lastId) : 0;
  }

  /**
   * Generate page numbers for pagination UI
   */
  static generatePageNumbers(currentPage, totalPages, maxPages = 7) {
    const pages = [];
    
    if (totalPages <= maxPages) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show limited pages with ellipsis
      const leftBound = Math.floor((maxPages - 3) / 2);
      const rightBound = Math.ceil((maxPages - 3) / 2);
      
      if (currentPage <= maxPages - 2) {
        // Near the beginning
        for (let i = 1; i <= maxPages - 2; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - (maxPages - 3)) {
        // Near the end
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - (maxPages - 3); i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // In the middle
        pages.push(1);
        pages.push('...');
        
        for (let i = currentPage - leftBound; i <= currentPage + rightBound; i++) {
          pages.push(i);
        }
        
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  }

  /**
   * Calculate skip and limit for MongoDB/Mongoose
   */
  static getMongoSkipLimit(page, limit) {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    
    return {
      skip: (pageNum - 1) * limitNum,
      limit: limitNum,
    };
  }

  /**
   * Validate pagination parameters
   */
  static validateParams(page, limit) {
    const errors = [];
    
    if (isNaN(page) || page < 1) {
      errors.push('Page must be a positive integer');
    }
    
    if (isNaN(limit) || limit < 1) {
      errors.push('Limit must be a positive integer');
    }
    
    if (limit > constants.PAGINATION.MAX_LIMIT) {
      errors.push(`Limit cannot exceed ${constants.PAGINATION.MAX_LIMIT}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sort items with custom comparator
   */
  static sortItems(items, sortBy, sortOrder = 'ASC') {
    if (!items || items.length === 0) return items;
    
    const sortedItems = [...items];
    
    sortedItems.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      // Handle nested properties
      if (sortBy.includes('.')) {
        aValue = this.getNestedValue(a, sortBy);
        bValue = this.getNestedValue(b, sortBy);
      }
      
      // Handle different data types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (aValue < bValue) return sortOrder === 'ASC' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'ASC' ? 1 : -1;
      return 0;
    });
    
    return sortedItems;
  }

  /**
   * Get nested property value
   */
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current ? current[key] : undefined;
    }, obj);
  }

  /**
   * Filter items with multiple criteria
   */
  static filterItems(items, filters = {}) {
    if (!filters || Object.keys(filters).length === 0) return items;
    
    return items.filter(item => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === undefined || value === null) return true;
        
        const itemValue = this.getNestedValue(item, key);
        
        if (Array.isArray(value)) {
          return value.includes(itemValue);
        }
        
        if (typeof value === 'object') {
          // Handle complex filters like { $gt: 10 }
          return this.applyFilterOperator(itemValue, value);
        }
        
        return itemValue === value;
      });
    });
  }

  /**
   * Apply filter operators
   */
  static applyFilterOperator(itemValue, filter) {
    for (const [operator, filterValue] of Object.entries(filter)) {
      switch (operator) {
        case '$eq':
          if (itemValue !== filterValue) return false;
          break;
        case '$ne':
          if (itemValue === filterValue) return false;
          break;
        case '$gt':
          if (!(itemValue > filterValue)) return false;
          break;
        case '$gte':
          if (!(itemValue >= filterValue)) return false;
          break;
        case '$lt':
          if (!(itemValue < filterValue)) return false;
          break;
        case '$lte':
          if (!(itemValue <= filterValue)) return false;
          break;
        case '$in':
          if (!filterValue.includes(itemValue)) return false;
          break;
        case '$nin':
          if (filterValue.includes(itemValue)) return false;
          break;
        case '$like':
          if (!String(itemValue).includes(filterValue)) return false;
          break;
        case '$regex':
          const regex = new RegExp(filterValue);
          if (!regex.test(String(itemValue))) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  /**
   * Paginate array manually (for small datasets)
   */
  static paginateArray(array, page, limit) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return {
      items: array.slice(startIndex, endIndex),
      total: array.length,
      page,
      limit,
      totalPages: Math.ceil(array.length / limit),
    };
  }
}

module.exports = PaginationHelper;