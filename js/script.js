// Constants
const RECIPE_CONTAINER_SELECTORS = [
    '.recipe-callout',
    '.tasty-recipes',
    '.easyrecipe',
    '.innerrecipe',
    '.recipe-summary.wide',
    '.wprm-recipe-container',
    '.recipe-content',
    '.simple-recipe-pro',
    'div[id*="article-content_1-0"]',
    'div[itemtype="http://schema.org/Recipe"]',
    'div[itemtype="https://schema.org/Recipe"]',
    '.recipe-container',
    '[class*="recipe"][class*="container"]',
    '.recipe-body'
];

// UI Elements
const closeButton = createCloseButton();
const disableButton = createDisableButton();
const controls = createControlsContainer();
const footer = createFooter();

// Main function to initialize the extension
function initializeRecipeSpotlight() {
    console.log("Initializing Recipe Spotlight");
    chrome.storage.sync.get(document.location.hostname, function(items) {
        console.log("Current hostname:", document.location.hostname);
        console.log("Stored items:", items);
        if (!(document.location.hostname in items)) {
            console.log("Displaying recipe popup");
            displayRecipePopup();
        } else {
            console.log("Hostname is blacklisted, not displaying popup");
        }
    });
}

// Function to create and display the recipe popup
function displayRecipePopup() {
    console.log("Displaying recipe popup");
    const recipeComponents = findRecipeComponents();
    
    if (!recipeComponents) {
        console.log("No recipe components found, exiting");
        return false;
    }

    const recipeDiv = createRecipeContainer();
    populateRecipeContent(recipeDiv, recipeComponents);

    if (recipeDiv.querySelector('#_recipe_spotlight_content').children.length > 0) {
        console.log("Recipe content found, adding popup to page");
        addPopupToPage(recipeDiv);
        setupEventListeners(recipeDiv);
        return true;
    }

    console.log("No recipe content found");
    return false;
}

// Function to find recipe components on the page
function findRecipeComponents() {
    console.log("Finding recipe components");
    const structuredData = extractStructuredRecipeData();
    
    if (structuredData) {
        console.log("Structured recipe data found:", structuredData);
        return {
            container: [{ element: document.createElement('div'), score: 1000 }],
            ingredients: [{ element: createListElement(structuredData.ingredients), score: 1000 }],
            directions: [{ element: createListElement(structuredData.instructions), score: 1000 }],
            structuredData: structuredData
        };
    }
    
    // If no structured data, fall back to the original method
    const recipeComponents = {
        container: [],
        ingredients: [],
        directions: []
    };

    const componentSelectors = {
        container: RECIPE_CONTAINER_SELECTORS,
        ingredients: ['.ingredients', '[itemprop="recipeIngredient"]', '.ingredient-list', '[class*="ingredient"]'],
        directions: ['.instructions', '[itemprop="recipeInstructions"]', '.directions', '.steps', '[class*="instruction"]', '[class*="direction"]']
    };

    // Check if any recipe selectors are found
    let recipeFound = false;
    for (const selector of RECIPE_CONTAINER_SELECTORS) {
        if (document.querySelector(selector)) {
            recipeFound = true;
            break;
        }
    }

    if (!recipeFound) {
        console.log("No recipe found on the page");
        return null;
    }

    // Find and score potential recipe components
    for (const [component, selectors] of Object.entries(componentSelectors)) {
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const score = calculateElementScore(el);
                recipeComponents[component].push({ element: el, score: score });
            });
        }
    }
    // Sort components by score and take the top 3
    for (const component in recipeComponents) {
        recipeComponents[component].sort((a, b) => b.score - a.score);
        recipeComponents[component] = recipeComponents[component].slice(0, 3);
    }

    console.log("Recipe components found:", recipeComponents);
    return recipeComponents;
}

// Function to calculate the score of an element
function calculateElementScore(element) {
    let score = 0;
    
    // Prioritize elements with more text content
    score += element.textContent.length;

    const lowerText = element.textContent.toLowerCase();

    // Boost score for elements with common recipe-related words
    const recipeKeywords = ['ingredients', 'directions', 'instructions', 'steps', 'method', 'preparation'];
    recipeKeywords.forEach(keyword => {
        if (lowerText.includes(keyword)) {
            score += 50;
        }
    });

    // Give a big boost if the element contains both ingredients and directions
    if (lowerText.includes('ingredients') && (lowerText.includes('directions') || lowerText.includes('instructions'))) {
        score += 500;
    }

    // Boost score for lists, which are common in recipes
    score += element.querySelectorAll('ul, ol').length * 20;

    // Penalize elements that are likely to be ads or unrelated content
    if (element.querySelector('[class*="ad"], [id*="ad"]')) {
        score -= 100;
    }

    return score;
}

// Function to create the recipe container
function createRecipeContainer() {
    const recipeDiv = document.createElement('div');
    recipeDiv.id = '_recipe_spotlight_highlight';
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('css/popup.css');
    recipeDiv.appendChild(style);
    return recipeDiv;
}

// Function to check for duplicate text content
function isDuplicateText(element, container) {
    const textContent = element.textContent.trim();
    return Array.from(container.children).some(child => child.textContent.trim() === textContent);
}

// Function to populate the recipe content
function populateRecipeContent(recipeDiv, recipeComponents) {
    const contentDiv = document.createElement('div');
    contentDiv.id = '_recipe_spotlight_content';

    if (recipeComponents.structuredData) {
        const data = recipeComponents.structuredData;
        
        // Add recipe name
        const nameHeader = document.createElement('h1');
        nameHeader.textContent = data.name;
        contentDiv.appendChild(nameHeader);
        
        // Add description if available
        if (data.description) {
            const descriptionP = document.createElement('p');
            descriptionP.textContent = data.description;
            contentDiv.appendChild(descriptionP);
        }
        
        // Add cooking times and yield
        const metaInfo = document.createElement('div');
        metaInfo.innerHTML = `
            ${data.prepTime ? `<p>Prep Time: ${data.prepTime}</p>` : ''}
            ${data.cookTime ? `<p>Cook Time: ${data.cookTime}</p>` : ''}
            ${data.totalTime ? `<p>Total Time: ${data.totalTime}</p>` : ''}
            ${data.yield ? `<p>Yield: ${data.yield}</p>` : ''}
        `;
        contentDiv.appendChild(metaInfo);
        
        // Add ingredients and instructions
        addComponentToContent(contentDiv, 'Ingredients', [recipeComponents.ingredients[0]], isDuplicateText);
        addComponentToContent(contentDiv, 'Instructions', [recipeComponents.directions[0]], isDuplicateText);
    } else {
        // Fall back to the original method if no structured data
        if (recipeComponents['ingredients'].length > 0 && recipeComponents['directions'].length > 0) {
            addComponentToContent(contentDiv, 'Ingredients', recipeComponents['ingredients'], isDuplicateText);
            addComponentToContent(contentDiv, 'Directions', recipeComponents['directions'], isDuplicateText);
        } else {
            ['ingredients', 'directions', 'container'].forEach(component => {
                if (recipeComponents[component].length > 0) {
                    addComponentToContent(contentDiv, component.charAt(0).toUpperCase() + component.slice(1), recipeComponents[component], isDuplicateText);
                }
            });
        }
    }

    // Remove ads and unnecessary elements
    removeAdsAndUnnecessaryElements(contentDiv);

    recipeDiv.appendChild(controls);
    recipeDiv.appendChild(contentDiv);
    recipeDiv.appendChild(footer);
}

// Function to add a component to the content div
function addComponentToContent(contentDiv, title, components, isDuplicateText) {
    const header = document.createElement('h2');
    header.textContent = title;
    header.classList.add('_recipe_spotlight_section_header');
    contentDiv.appendChild(header);

    components.forEach(({ element }) => {
        if (!isDuplicateText(element, contentDiv)) {
            const clonedElement = element.cloneNode(true);
            standardizeFormatting(clonedElement);
            contentDiv.appendChild(clonedElement);
        }
    });
}

// Function to remove ads and unnecessary elements
function removeAdsAndUnnecessaryElements(element) {
    removeAds(element);
    removeUnnecessaryElements(element);
}

// Function to remove ads
function removeAds(element) {
    const adSelectors = [
        '.ad', '.ads', '.advertisement', 
        '[class*="ad-"]', '[id*="ad-"]',
        '[class*="advertisement"]', '[id*="advertisement"]',
        'iframe', 'ins.adsbygoogle',
        'div[class*="ad"]', 'div[id*="ad"]',
        'div[class*="advertisement"]', 'div[id*="advertisement"]',
        'div[id*="google_ads"]',
        '[class*="adsense"]', '[id*="adsense"]',
        '[data-ad]', '[data-ads]', '[data-ad-unit]',
        '[aria-label*="advertisement"]',
        'script[src*="ads"]', 'script[src*="ad-"]'
    ];
    
    adSelectors.forEach(selector => {
        element.querySelectorAll(selector).forEach(ad => {
            ad.remove();
        });
    });
    
    // Remove elements with IDs containing 'ad' or 'ads' (case-insensitive)
    const adIdRegex = /ad|ads/i;
    element.querySelectorAll('*[id]').forEach(el => {
        if (adIdRegex.test(el.id)) {
            el.remove();
        }
    });
    
    // Remove inline scripts that might be used for ad insertion
    element.querySelectorAll('script:not([src])').forEach(script => {
        if (script.textContent.includes('ads') || script.textContent.includes('advertisement')) {
            script.remove();
        }
    });
}

// Function to remove unnecessary elements
function removeUnnecessaryElements(element) {
    const unnecessarySelectors = [
        'button:not(._rsbtn)', 
        'input[type="button"]', 
        '.social-share', 
        '.print-button',
        '.email-button',
        '.rating',
        '.comment-section',
        '.author-bio',
        '.related-recipes',
        '.nutrition-label',
        'video',
        'iframe',
        'img',
        '[class*="image"]',
        '[id*="image"]',
        '[class*="photo"]',
        '[id*="photo"]',
        '[class*="picture"]',
        '[id*="picture"]',
        '[class*="img"]',
        '[id*="img"]',
        '[class*="thumbnail"]',
        '[id*="thumbnail"]',
        'svg',
        '[class*="svg"]',
        '[id*="svg"]',
        '[class*="video"]',
        '[id*="video"]',
        '[class*="share"]',
        '[class*="print"]',
        '[class*="email"]',
        '[class*="rating"]',
        '[class*="comment"]',
        '[class*="author"]',
        '[class*="related"]',
        '[class*="nutrition"]'
    ];

    unnecessarySelectors.forEach(selector => {
        element.querySelectorAll(selector).forEach(el => {
            el.remove();
        });
    });

    // Remove background images
    element.querySelectorAll('*').forEach(el => {
        if (el.style.backgroundImage) {
            el.style.backgroundImage = 'none';
        }
    });
}

// Function to standardize formatting of recipe elements
function standardizeFormatting(element) {
    // Replace hyperlinks with their text content
    element.querySelectorAll('a').forEach(link => {
        const textNode = document.createTextNode(link.textContent);
        link.parentNode.replaceChild(textNode, link);
    });

    // Remove icons and other unnecessary content
    element.querySelectorAll('i, svg, img:not([alt*="recipe"]):not([alt*="food"]), [class*="icon"]').forEach(el => el.remove());

    // Standardize heading sizes
    element.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
        heading.style.fontSize = '1.2em';
        heading.style.fontWeight = 'bold';
        heading.style.margin = '1em 0 0.5em';
    });

    // Standardize paragraph spacing
    element.querySelectorAll('p').forEach(p => {
        p.style.margin = '0.5em 0';
    });

    // Standardize list formatting
    element.querySelectorAll('ul, ol').forEach(list => {
        list.style.paddingLeft = '1.5em';
        list.style.margin = '0.5em 0';
    });

    // Standardize font
    element.style.fontFamily = 'Arial, sans-serif';
    element.style.fontSize = '16px';
    element.style.lineHeight = '1.5';
    element.style.color = '#333';

    // Remove empty elements
    element.querySelectorAll('*').forEach(el => {
        if (el.innerHTML.trim() === '' && !['BR', 'HR'].includes(el.tagName)) {
            el.remove();
        }
    });

    return element;
}

// Function to add the popup to the page
function addPopupToPage(recipeDiv) {
    recipeDiv.style.transition = 'opacity 500ms';
    recipeDiv.style.display = 'block';
    recipeDiv.style.opacity = 0;

    document.body.insertBefore(recipeDiv, document.body.firstChild);

    window.setTimeout(() => {
        // Fade in
        recipeDiv.style.opacity = 1;
        // Scroll to top in case they hit refresh while lower in page
        document.scrollingElement.scrollTop = 0;
    }, 10);
}

// Function to setup event listeners for the popup
function setupEventListeners(recipeDiv) {
    closeButton.addEventListener('click', hidePopup);
    disableButton.addEventListener('click', function(b) {
        chrome.storage.sync.set({[document.location.hostname]: true}, hidePopup);
    });

    // Add an event listener for clicking outside the recipe to close it
    document.body.addEventListener('click', handleOutsideClick);
    resizePopup();
    window.addEventListener('resize', resizePopup);
}

// Function to hide the popup
function hidePopup() {
    let highlight = document.getElementById('_recipe_spotlight_highlight');
    highlight.style.transition = 'opacity 400ms';
    highlight.style.opacity = 0;
    window.removeEventListener('resize', resizePopup);
    document.body.removeEventListener('click', handleOutsideClick);
    setTimeout(() => {
        highlight.style.display = 'none';
    }, 400);
}

// Function to resize the popup
function resizePopup() {
    const recipeDiv = document.getElementById('_recipe_spotlight_highlight');
    if (recipeDiv) {
        const windowHeight = window.innerHeight;
        const maxHeight = windowHeight - 40; // 20px top margin + 20px bottom margin
        recipeDiv.style.maxHeight = `${maxHeight}px`;

        const contentDiv = document.getElementById('_recipe_spotlight_content');
        const headerDiv = document.getElementById('_recipe_spotlight_header');
        const footerDiv = document.getElementById('_recipe_spotlight_footer');
        
        if (contentDiv && headerDiv && footerDiv) {
            const headerHeight = headerDiv.offsetHeight;
            const footerHeight = footerDiv.offsetHeight;
            const contentPadding = parseInt(window.getComputedStyle(contentDiv).paddingTop) + 
                                   parseInt(window.getComputedStyle(contentDiv).paddingBottom);
            const contentMaxHeight = maxHeight - headerHeight - footerHeight - contentPadding;
            contentDiv.style.maxHeight = `${contentMaxHeight}px`;
            contentDiv.style.overflowY = 'auto';
        }
    }
}

// Function to handle clicks outside the popup
function handleOutsideClick(event) {
    const recipeDiv = document.getElementById('_recipe_spotlight_highlight');
    if (recipeDiv && !recipeDiv.contains(event.target)) {
        hidePopup();
        document.body.removeEventListener('click', handleOutsideClick);
    }
}

// Helper functions to create UI elements
function createCloseButton() {
    const button = document.createElement('button');
    button.id = '_recipe_spotlight_closebtn';
    button.classList.add('_rsbtn', '_recipe_spotlight_iconbtn');
    button.innerHTML = '&#10005;';
    button.title = 'Close recipe';
    return button;
}

function createDisableButton() {
    const button = document.createElement('button');
    button.id = '_recipe_spotlight_disablebtn';
    button.classList.add('_rsbtn');
    button.textContent = 'Disable on this site';
    return button;
}

function createControlsContainer() {
    const controls = document.createElement('div');
    controls.id = '_recipe_spotlight_header';

    const logoTitleContainer = document.createElement('div');
    logoTitleContainer.id = '_recipe_spotlight_logo_title_container';

    const logoImg = document.createElement('img');
    logoImg.src = chrome.runtime.getURL('img/icon-128.png');
    logoImg.alt = 'Recipe Spotlight Logo';
    logoImg.id = '_recipe_spotlight_logo';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'Recipe Spotlight';
    titleSpan.id = '_recipe_spotlight_title';

    logoTitleContainer.appendChild(logoImg);
    logoTitleContainer.appendChild(titleSpan);

    const buttonContainer = document.createElement('div');
    buttonContainer.id = '_recipe_spotlight_button_container';
    buttonContainer.appendChild(disableButton);
    buttonContainer.appendChild(closeButton);

    controls.appendChild(logoTitleContainer);
    controls.appendChild(buttonContainer);

    return controls;
}

function createFooter() {
    const footer = document.createElement('div');
    footer.id = '_recipe_spotlight_footer';
    footer.innerHTML = `
        <p>Recipe Spotlight may not work on all sites. Help us improve!</p>
        <div class="_recipe_spotlight_footer_links">
            <a href="https://chromewebstore.google.com/detail/recipe-spotlight/aofgifkomfpmnlbpdihbnkniipklbleg" target="_blank" class="_recipe_spotlight_footer-link">Leave a review to request site compatibility.</a>
        </div>
        <div class="_recipe_spotlight_footer-social">
            <a href="https://github.com/ryanchmelir/recipespotlight" target="_blank" class="_recipe_spotlight_social-icon">
                <img src="${chrome.runtime.getURL('img/github-128.png')}" alt="GitHub" />
            </a>
            <a href="https://www.buymeacoffee.com/ryanch" target="_blank" class="_recipe_spotlight_social-icon">
                <img src="${chrome.runtime.getURL('img/bmc.png')}" alt="Buy Me A Coffee" />
            </a>
        </div>
    `;
    return footer;
}

// Function to extract structured recipe data
function extractStructuredRecipeData() {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
        try {
            const data = JSON.parse(script.textContent);
            if (data['@type'] === 'Recipe' || (Array.isArray(data['@graph']) && data['@graph'].some(item => item['@type'] === 'Recipe'))) {
                let recipeData = data['@type'] === 'Recipe' ? data : data['@graph'].find(item => item['@type'] === 'Recipe');
                return {
                    name: recipeData.name,
                    ingredients: Array.isArray(recipeData.recipeIngredient) ? recipeData.recipeIngredient : [],
                    instructions: Array.isArray(recipeData.recipeInstructions) 
                        ? recipeData.recipeInstructions.map(step => typeof step === 'string' ? step : step.text)
                        : typeof recipeData.recipeInstructions === 'string' 
                            ? [recipeData.recipeInstructions] 
                            : [],
                    description: recipeData.description || '',
                    image: recipeData.image || '',
                    cookTime: recipeData.cookTime || '',
                    prepTime: recipeData.prepTime || '',
                    totalTime: recipeData.totalTime || '',
                    yield: recipeData.recipeYield || ''
                };
            }
        } catch (e) {
            console.error('Error parsing JSON-LD:', e);
        }
    }
    return null;
}

// Function to create a list element from an array of items
function createListElement(items) {
    const list = document.createElement('ul');
    items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
    });
    return list;
}

// Initialize the extension
initializeRecipeSpotlight();
