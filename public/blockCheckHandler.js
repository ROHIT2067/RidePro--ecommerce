/**
 * Client-side handler for blocked user detection
 * Intercepts API responses and handles blocked user scenarios
 */

(function() {
  'use strict';

  /**
   * Check if response indicates user is blocked
   */
  function isBlockedResponse(response) {
    return response && 
           response.blocked === true && 
           response.success === false;
  }

  /**
   * Handle blocked user response
   */
  function handleBlockedUser(response) {
    const message = response.message || 'Your account has been blocked. Please contact support.';
    const redirectUrl = response.redirectUrl || '/login';

    // Show alert to user
    if (typeof Swal !== 'undefined') {
      // If SweetAlert2 is available
      Swal.fire({
        icon: 'error',
        title: 'Account Blocked',
        text: message,
        confirmButtonText: 'Go to Login',
        allowOutsideClick: false,
        allowEscapeKey: false
      }).then(() => {
        window.location.href = redirectUrl;
      });
    } else {
      // Fallback to native alert
      alert(message);
      window.location.href = redirectUrl;
    }
  }

  /**
   * Wrap fetch to automatically check for blocked user responses
   */
  if (window.fetch) {
    const originalFetch = window.fetch;
    
    window.fetch = function(...args) {
      return originalFetch.apply(this, args)
        .then(response => {
          // Clone response so we can read it
          const clonedResponse = response.clone();
          
          // Check if it's JSON
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return clonedResponse.json()
              .then(data => {
                if (isBlockedResponse(data)) {
                  handleBlockedUser(data);
                  // Return rejected promise to stop further processing
                  return Promise.reject(new Error('User blocked'));
                }
                // Return original response
                return response;
              })
              .catch(err => {
                // If JSON parsing fails, return original response
                if (err.message === 'User blocked') {
                  throw err;
                }
                return response;
              });
          }
          
          return response;
        });
    };
  }

  /**
   * Wrap XMLHttpRequest to automatically check for blocked user responses
   */
  if (window.XMLHttpRequest) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._url = url;
      this._method = method;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        if (this.status === 403) {
          try {
            const response = JSON.parse(this.responseText);
            if (isBlockedResponse(response)) {
              handleBlockedUser(response);
            }
          } catch (e) {
            // Not JSON or parsing failed, ignore
          }
        }
      });
      
      return originalSend.apply(this, args);
    };
  }

  /**
   * jQuery AJAX interceptor (if jQuery is available)
   */
  if (window.jQuery) {
    jQuery(document).ajaxComplete(function(event, xhr) {
      if (xhr.status === 403) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (isBlockedResponse(response)) {
            handleBlockedUser(response);
          }
        } catch (e) {
          // Not JSON or parsing failed, ignore
        }
      }
    });
  }

  /**
   * Axios interceptor (if Axios is available)
   */
  if (window.axios) {
    window.axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && error.response.status === 403) {
          const data = error.response.data;
          if (isBlockedResponse(data)) {
            handleBlockedUser(data);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  console.log('Block check handler initialized');
})();
