import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Constants
const MAG_CUTOFF = 8.5;
const R0 = 300;
const r_fact = 0.035//0.15;
const BASE_ROTATION_SPEED = 0.001;
const ZOOM_SPEED = 0.01;
const MOVE_SPEED = 0.1;

// Variables
let EXOPLANET_ID = "Kepler-1032 b";
let jobId = null; // Declare the jobId variable outside
var jobCompleted;
var rateLimitExceeded;
const interval = 200;
let positions = [];
let GaiaIDs = [];
let numericIDs = [];
let colors = [];
let highestID = 0;
let maxRenderDistance = 100; // Initial distance cutoff for particles

// Mouse interaction variables
let isDragging = false;
let prevMouseX = 0;
let prevMouseY = 0;
const baseRotationSpeed = 0.001;

const quaternion = new THREE.Quaternion();
const rotation = new THREE.Euler(0, 3/2 * Math.PI, 0, 'YXZ');

// predefined constellations
const predefined_constellations = {
    "big-dipper": ["Gaia DR3 6691059392150532992", "Gaia DR3 6690538945193477760", "Gaia DR3 6760185310253266432", "Gaia DR3 6691059392150532992"],
    "ursa-major": ["Gaia DR3 6863535898551993472", "Gaia DR3 6877646549745634560", "Gaia DR3 6855318389161195904"],
    "cassiopeia": ["Gaia DR3 6463748969563201152", "Gaia DR3 6454999399628150016", "Gaia DR3 6670402626680307840", "Gaia DR3 6675723472684914560", "Gaia DR3 6463748969563201152"]
};

var custom_constellations = {};

var loadedConstellations = [];
var multiSelectedStars = [];

// Call initialize when the page loads
initialize();

document.addEventListener('DOMContentLoaded', () => {
    const exoplanetInput = document.getElementById('dropdown-menu');
    const fetchButton = document.getElementById('fetch-button');
    let loadingWidget = document.getElementById('loading-widget');
    let loadingImage = document.getElementById('loading-image');
    const button = document.getElementById('fetch-button');
    const dropdownButton = document.getElementById("dropdown-button");
    const dropdownContent = document.getElementById("dropdown-content");
    const customDropdownButton = document.getElementById('custom-dropdown-button');
    const customDropdownContent = document.getElementById('custom-dropdown-content');

    const nameModal = document.getElementById('name-modal');
    const openModalButton = document.querySelector('a[data-value="new-constellation"]');
    const closeButton = document.querySelector('#name-modal .close');
    const submitButton = document.getElementById('submit-constellation-button');
    const inputField = document.getElementById('constellation-name-input');

    // Open the modal when "New Constellation" is clicked
    openModalButton.addEventListener('click', function (event) {
        if (multiSelectedStars.length > 1 && GaiaIDs.length > 0){
            event.preventDefault(); // Prevent the default link behavior
            nameModal.style.display = 'block'; // Show the modal
        }
    });

    // Close the modal when the close button is clicked
    closeButton.addEventListener('click', function () {
        nameModal.style.display = 'none'; // Hide the modal
    });
    
    // Close the modal when clicking outside of the modal
    window.addEventListener('click', function (event) {
        if (event.target === nameModal) {
            nameModal.style.display = 'none'; // Hide the modal
        }
    });

    // Handle submission of the constellation name
    submitButton.addEventListener('click', function () {
        const constellationName = inputField.value.trim(); // Get the input value

        if (constellationName) {
            // Process the constellation name (e.g., add to custom_constellations)
            console.log('New Constellation Name:', constellationName);
            
            // Here you would add the logic to store this name in custom_constellations
            // For example: custom_constellations[constellationName] = someData;

            // ensure stars are selected and that there are stars viewable. prevents formation of empty constellations
            if (multiSelectedStars.length > 1 && GaiaIDs.length > 0){
                console.log('New Constellation selected');
                console.log(multiSelectedStars);
                var name = constellationName;
                var custom_id = name.toLowerCase().replace(/\s+/g, '-');

                const _points = [];
                multiSelectedStars.forEach(ID => {
                    // get indexes of the stars
                    const idx = GaiaIDs.indexOf(ID);
                    _points.push(new THREE.Vector3(positions[3*idx], positions[3*idx + 1], positions[3*idx + 2]));
                });
                const _geometry = new THREE.BufferGeometry().setFromPoints(_points);
                const _material = new THREE.LineBasicMaterial({ color: 0xff0000 });
                const _line = new THREE.Line(_geometry, _material);
                scene.add(_line);
                loadedConstellations.push([_line, _geometry, _material, custom_id]);

                custom_constellations[custom_id] = multiSelectedStars;
                console.log(custom_constellations);
                clearSelectedPoints();
                multiSelectedStars = [];

                var newLink = document.createElement('a');
                newLink.href = '#';
                newLink.dataset.value = custom_id;
                newLink.textContent = name;

                var exists = Array.from(document.getElementById('custom-dropdown-content').children).some(link => link.dataset.value === custom_id);
                if (!exists){    
                    document.getElementById('custom-dropdown-content').appendChild(newLink);
                }
            }

            modal.style.display = 'none'; // Hide the modal after submission
            inputField.value = ''; // Clear the input field

            nameModal.style.display = 'none'; // Hide the modal
        } else {
            alert('Please enter a valid constellation name. ');
        }
    });

    // Toggle dropdown on button click
    dropdownButton.addEventListener("click", () => {
        dropdownContent.style.display = 
            dropdownContent.style.display === "block" ? "none" : "block";
    });

    // Show/hide dropdown on button click
    customDropdownButton.addEventListener('click', () => {
        // Toggle the display of the dropdown
        if (customDropdownContent.style.display === 'block') {
            customDropdownContent.style.display = 'none';
        } else {
            customDropdownContent.style.display = 'block';
        }
    });

    // Close dropdown if clicked outside
    window.addEventListener("click", (event) => {
        if (!event.target.matches('#dropdown-button')) {
            dropdownContent.style.display = "none";
        }
        if (!event.target.matches('#custom-dropdown-button')) {
            customDropdownContent.style.display = "none";
        }

        // PREDEFINED CONSTELLATIONS
        // Ensure the clicked element is an anchor <a> tag
        if (event.target.closest('#dropdown-content') || event.target.closest('#custom-dropdown-content')){
            if (event.target.tagName === 'A') {
                const selectedConstellation = event.target.getAttribute('data-value');
                if (selectedConstellation != "new-constellation"){
                    console.log('Selected Constellation:', selectedConstellation);

                    var constellationIDs = predefined_constellations[selectedConstellation] || custom_constellations[selectedConstellation];

                    // make sure that there are stars loaded
                    if (GaiaIDs.length > 0) {
                        // if constellation is already loaded, delete it
                        var flag = true;

                        loadedConstellations.forEach(constellation => {
                            console.log(constellation[3]);
                            if (constellation[3] === selectedConstellation){
                                scene.remove(constellation[0]);
                                constellation[1].dispose();
                                constellation[2].dispose();
                                const idx = loadedConstellations.indexOf(constellation);
                                loadedConstellations.splice(idx, 1);
                                flag = false;
                            }
                        });
                        if (flag){
                            const _points = [];
                            constellationIDs.forEach(ID => {
                                // get indexes of the stars
                                const idx = GaiaIDs.indexOf(ID);
                                _points.push(new THREE.Vector3(positions[3*idx], positions[3*idx + 1], positions[3*idx + 2]));
                            });
                            const _geometry = new THREE.BufferGeometry().setFromPoints(_points);
                            const _material = new THREE.LineBasicMaterial({ color: 0xff0000 });
                            const _line = new THREE.Line(_geometry, _material);
                            scene.add(_line);
                            loadedConstellations.push([_line, _geometry, _material, selectedConstellation]);
                        }
                    }
                    
                    // You can now use the 'selectedConstellation' value to do other things, such as:
                    // - Load the corresponding constellation data
                    // - Render the selected constellation in Three.js
                    // Example: displayConstellation(selectedConstellation);
                }
            }
        }
    });

    fetchButton.addEventListener('click', async () => {
        try {
            // Grab the position of the exoplanet
            const inputValue = searchInput.value.trim();
            const exoplanetPosition = await handleExoplanetInput(inputValue);
            
            // Ensure position is not null
            if (exoplanetPosition == null) return;
            // Send the job request, and save the returned job ID
            console.log(inputValue);

            jobId = await submitJob(MAG_CUTOFF, exoplanetPosition, inputValue);
            console.log(jobId);
            // Ensure job ID is not null
            if (jobId == null) return;

            jobCompleted = false;
            rateLimitExceeded = false;

            // Array of loading images
            const loadingImages = [
                '/assets/loading_1.gif',
                '/assets/loading_2.gif',
                '/assets/loading_3.gif'
            ];

            // Randomly select an image
            const randomIndex = Math.floor(Math.random() * loadingImages.length);
            loadingImage.src = loadingImages[randomIndex];

            loadingWidget.style.display = 'block'; // Show the widget
            
            // Disable the button
            button.disabled = true;
            deleteAllStars();
            
            fetch(`https://api.exosky.org/exo_data/${inputValue}`)
               .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(data => {
                    console.log(data)
                    // Display the modal
                    // Update the content of the modal
                    const DM = data['DM'];
                    const YD = data['YD'];
                    const HBT = data['HBT'];
                    const RA = data['RA']; // Round to 2 decimal places
                    const DEC = data['DEC']; // Round to 2 decimal places
                    const DIST = data['DIST']; // Round to nearest integer
                    const PLMASS = data['PLMASS']; // Round to 2 decimal places
                    const PLORBPER = data['PLORBPER']; // Round to nearest integer
                    const HOSTNAME = data['HOSTNAME'];
                    const TEMP = data['TEMP']; // Round to nearest integer
                    const HOSTMASS = data['HOSTMASS']; // Round to 2 decimal places
                    const TYPE = data['TYPE'];
                    const MAG = data['MAG']; // Round to 2 decimal places
                    const IMAGE = data['IMAGE'];

                    const imgElement = document.getElementById('galactic-map');
                    imgElement.src = `data:image/png;base64,${IMAGE}`;

                    document.getElementById('exoplanet-discovery').textContent = DM;
                    document.getElementById('exoplanet-year').textContent = YD;
                    document.getElementById('exoplanet-habitable').textContent = HBT;
                    document.getElementById('exoplanet-ra').textContent = RA + " deg";
                    document.getElementById('exoplanet-dec').textContent = DEC + " deg"; // Updated
                    document.getElementById('exoplanet-distance').textContent = DIST + " pc"; // Updated
                    document.getElementById('exoplanet-mass').textContent = PLMASS + " Earth Masses"; // Updated
                    document.getElementById('exoplanet-period').textContent = PLORBPER + " days"; // Updated
                    document.getElementById('stellar-name').textContent = HOSTNAME; // Updated
                    document.getElementById('stellar-temp').textContent = TEMP + "K"; // Updated
                    document.getElementById('stellar-mass').textContent = HOSTMASS + " Solar Masses"; // Updated
                    document.getElementById('stellar-type').textContent = TYPE;
                    document.getElementById('stellar-mag').textContent = MAG; // Updated
                })
                .catch(error => {
                    console.error('There was a problem with the fetch operation:', error);
                });

            console.log('Job ID:', jobId);

            // Poll for job completion using setTimeout for async handling
            async function pollJobStatus() {
                try {
                    if (!jobCompleted) {

                        const data = await fetchAndProcessData(jobId);

                        // Plot the star(s) in the sky
                        addStarBatch(data[0]);

                        // Re-call pollJobStatus after a delay if job is not completed
                        setTimeout(pollJobStatus, interval);
                    } else if (jobCompleted) {
                        console.log("done!");
                        loadingWidget.style.display = 'none';
                    } else if (rateLimitExceeded){
                        console.log("Slow down! You exceeded the rate limit of 1 request per minute");
                    }
                } catch (error) {
                    console.error('Error while fetching data:', error);
                }
            }

            // Start polling for job completion
            pollJobStatus();
            // Set a timeout to re-enable the button after the rate limit duration
            setTimeout(() => {
                button.disabled = false; // Re-enable the button
            }, 15000);
            
        } catch (error) {
            console.error('An error occurred:', error);
        }
    });
});

// Scene setup
const scene = new THREE.Scene();

// Set the background color to black
scene.background = new THREE.Color(0x0a0112);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 0);
camera.lookAt(new THREE.Vector3(1, 0, 0));

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('scene-container').appendChild(renderer.domElement);

const renderScene = new RenderPass(scene, camera);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.1,
    0.0
);
composer.addPass(bloomPass);

const radius = 5; // Radius of the sphere
const segments = 16; // Number of meridians and parallels

// Material for the grid lines
const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xcccccc,  // Light gray color
    transparent: true,
    opacity: 0.05,      // Set the transparency level (0.0 fully transparent, 1.0 fully opaque)
    depthTest: false
});


// Function to create meridians (vertical lines)
function createMeridianLines(radius, segments) {
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2; // Longitude angle
        const geometry = new THREE.BufferGeometry();
        const vertices = [];

        for (let j = 0; j <= segments; j++) {
            const latAngle = (j / segments) * Math.PI; // Latitude angle
            const x = radius * Math.sin(latAngle) * Math.cos(angle);
            const y = radius * Math.cos(latAngle);
            const z = radius * Math.sin(latAngle) * Math.sin(angle);
            vertices.push(x, y, z);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const meridianLine = new THREE.Line(geometry, lineMaterial);
        scene.add(meridianLine);
    }
}

function createParallelLines(radius, segments) {
    // Create horizontal circles (parallel lines) for latitude
    for (let i = 0; i <= segments; i++) {
        const latAngle = ((i / segments) - 0.5) * Math.PI; // Latitude angle from -π/2 to π/2
        const geometry = new THREE.BufferGeometry();
        const vertices = [];

        for (let j = 0; j <= segments; j++) {
            const lonAngle = (j / segments) * Math.PI * 2; // Longitude angle
            const x = radius * Math.cos(latAngle) * Math.cos(lonAngle);
            const y = radius * Math.sin(latAngle);
            const z = radius * Math.cos(latAngle) * Math.sin(lonAngle);
            vertices.push(x, y, z);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const parallelLine = new THREE.LineLoop(geometry, lineMaterial);
        scene.add(parallelLine);
    }
}

// Create the grid lines
//createMeridianLines(radius, segments);
//createParallelLines(radius, segments);

// Create star points
const starSprite = new THREE.TextureLoader().load('assets/disc.png');
starSprite.colorSpace = THREE.SRGBColorSpace;
const pointsMaterial = new THREE.PointsMaterial({
    vertexColors: true,
    sizeAttenuation: true,
    map: starSprite,
    transparent: true,
    opacity: 1,
    blending: THREE.NormalBlending,
    depthTest: true,
    size: 1,
    alphaTest: 0.1
});

const pointsGeometry = new THREE.BufferGeometry();
const points = new THREE.Points(pointsGeometry, pointsMaterial);
scene.add(points);

// create black render distance sphere
const sphereGeometry = new THREE.SphereGeometry(R0, 32, 32);
const sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x0a0112,
    side: THREE.BackSide, 
})
const blackSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(blackSphere);

// Raycaster and mouse vector
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Functions
// Helper function to add a batch of stars
function addStarBatch(starData) {
    const newPositions = [];
    const newColors = [];
    const newGaiaIDs = [];
    const newNumericIDs = [];

    if (starData == undefined){
        return null;
    }

    starData.forEach(star => {
        // Star magnitude / size
        const magnitude = star.mag;
        const x = -1* star.y;
        const y = star.x;
        const z = star.z;
        const dist = Math.sqrt(x**2 + y**2 + z**2);
        const mult = R0 * Math.exp(r_fact * magnitude);
        const dfact = magnitude > 0 ? Math.exp(-0.01 * magnitude) : 1;
        const newID = ++highestID;

        // Star position (x, y, z)
        newPositions.push((x / dist) * mult, (y / dist) * mult, (z / dist) * mult);
        // Star color (r, g, b)
        newColors.push(star.r * dfact, star.g * dfact, star.b * dfact);

        // Star ID
        newGaiaIDs.push(star.GaiaID);
        newNumericIDs.push(newID);
    });

    
    // Append new data to the existing arrays
    positions = positions.concat(newPositions);
    colors = colors.concat(newColors);
    GaiaIDs = GaiaIDs.concat(newGaiaIDs);
    numericIDs = numericIDs.concat(newNumericIDs);

    // Update BufferGeometry with the new data
    pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    pointsGeometry.setAttribute('id', new THREE.Float32BufferAttribute(numericIDs, 1));

    // Inform Three.js that geometry needs to be updated
    pointsGeometry.attributes.position.needsUpdate = true;
    pointsGeometry.attributes.color.needsUpdate = true;
    pointsGeometry.attributes.id.needsUpdate = true;
    pointsGeometry.computeBoundingSphere();
}

async function submitJob(magCutoff, exo_coords, planet_name) {
    try {
        const response = await fetch('https://api.exosky.org/create_job', {
        //const response = await fetch('http://0.0.0.0:8080/create_job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                limiting_magnitude: magCutoff,
                coordinates: exo_coords,
                pl_name: planet_name
            }), 
        });
        const responseJSON = await response.json();
        return responseJSON.job_id;
    } catch (error) {
        console.log(error);
        return null;
    }
}

async function fetchAndProcessData(jobId) {
    const url = `https://api.exosky.org/get_job/${jobId}`;
    //const url = `http://0.0.0.0:8080/get_job/${jobId}`;

    try {
        const response = await fetch(url);
        
        if (response.status === 429) {
            console.error("Error 429: Too Many Requests. Please try again later.");
            rateLimitExceeded = true;
            return undefined; // Return undefined for 429 error
        }

        const completed_flag = response.headers.get('X-Is-Completed');

        if (!response.ok) {
            console.error("Error fetching data:", response.statusText);
            return undefined; // Return undefined in case of error
        }

        if (completed_flag == 'true'){
            jobCompleted = true;
        }

        const data = await response.json();

        return data; // Return the data if the job is not completed

    } catch (error) {
        console.error("Error in fetchAndProcessData:", error);
        return undefined; // Return undefined in case of error
    }
}

// Fetch and populate exoplanet data (called when the page loads)
async function populateExoplanetData() {
    const response = await fetch('/data/exoplanets.json');
    return await response.json();
}

// Sample JSON data will be fetched dynamically
let exoplanetData = {}; // To hold the fetched exoplanet data

// Grab references to elements
const dropdownMenu = document.getElementById('dropdown-menu');
const searchInput = document.getElementById('dropdown-search');  // Corrected input reference
const errorMessageElement = document.getElementById('error-message');
const fetchButton = document.getElementById('fetch-button');
const dropdownContainer = document.querySelector('.dropdown'); // Add this line

// Function to handle exoplanet input (called when clicking on a dropdown item or search button)
async function handleExoplanetInput(inputValue) {
    if (exoplanetData.hasOwnProperty(inputValue)) {
        errorMessageElement.style.display = 'none';
        const pos = [exoplanetData[inputValue].x/1000, exoplanetData[inputValue].y/1000, exoplanetData[inputValue].z/1000];
        //console.log(pos); // Use the position for rendering or other actions
        return pos;
    } else {
        errorMessageElement.style.display = 'block';  // Show the error message if exoplanet is not found
        return null;
    }
}

// Function to create the dropdown items
function populateDropdown(data) {
    dropdownMenu.innerHTML = '';  // Clear previous items

    // Loop through data and create menu items
    for (const [key, value] of Object.entries(data)) {
        const menuItem = document.createElement('a');
        menuItem.textContent = `${key}`;
        menuItem.href = '#';
        menuItem.addEventListener('click', () => {
            searchInput.value = key;  // Update search input to selected item
            handleExoplanetInput(key);  // Handle click on the dropdown item
            dropdownMenu.classList.remove('show');  // Hide the dropdown menu
        });
        dropdownMenu.appendChild(menuItem);
    }
}

function deleteAllStars() {
    // Clear the arrays
    positions = [];
    colors = [];
    GaiaIDs = [];
    numericIDs = [];
    
    // Update BufferGeometry to reflect the deletion
    pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    pointsGeometry.setAttribute('id', new THREE.Float32BufferAttribute(numericIDs, 1));

    // Inform Three.js that geometry needs to be updated
    pointsGeometry.attributes.position.needsUpdate = true;
    pointsGeometry.attributes.color.needsUpdate = true;
    pointsGeometry.attributes.id.needsUpdate = true;
    
    // Optionally compute new bounding sphere if necessary
    pointsGeometry.computeBoundingSphere();

    // remove constellations
    loadedConstellations.forEach(constellation => {
        scene.remove(constellation[0]);
        constellation[1].dispose();
        constellation[2].dispose();
    });
    loadedConstellations = [];

}

// Function to filter dropdown items based on search input
function filterDropdown() {
    const searchValue = searchInput.value.toLowerCase();
    const filteredData = Object.fromEntries(
        Object.entries(exoplanetData).filter(([key]) =>
            key.toLowerCase().includes(searchValue)
        )
    );
    populateDropdown(filteredData);
}

// Function to handle clicks outside the dropdown menu
function handleClickOutside(event) {
    if (!dropdownContainer.contains(event.target)) {
        dropdownMenu.classList.remove('show'); // Hide the dropdown menu
    }
}

// Event listener for search input
searchInput.addEventListener('input', () => {
    dropdownMenu.classList.add('show');
    filterDropdown();
});

// Initial population of the dropdown menu after fetching exoplanet data
async function initialize() {
    exoplanetData = await populateExoplanetData();
    populateDropdown(exoplanetData); // Populate dropdown on load
}


function updateSphereSize() {
  // You can tie maxRenderDistance to the FOV for a smoother zoom effect
  const fov = camera.fov;
  maxRenderDistance = -1/200 * (fov - 80) + 1.25; //100 / fov; // Example: Inverse relationship between FOV and max distance
  blackSphere.scale.set(maxRenderDistance, maxRenderDistance, maxRenderDistance);
  console.log(maxRenderDistance);
}

// getNearestStar
function getNearestStar(cutoffAngle = 0.05, threshold = 5) {
    const raycaster = new THREE.Raycaster();
    //const mouseNDC = new THREE.Vector2(
    //    (mouse.x / window.innerWidth) * 2 - 1,
    //    -(mouse.y / window.innerHeight) * 2 + 1
    //);

    // Set raycaster from the camera and mouse NDC coordinates
    raycaster.setFromCamera(mouse, camera);
    //console.log(mouseNDC);
    console.log(mouse.x, mouse.y)
    console.log(`Ray Origin: (${raycaster.ray.origin.x}, ${raycaster.ray.origin.y}, ${raycaster.ray.origin.z}), Ray Direction: (${raycaster.ray.direction.x}, ${raycaster.ray.direction.y}, ${raycaster.ray.direction.z})`);

    // Set the threshold for the raycaster to define how far from the ray the points can be
    raycaster.params.Points.threshold = threshold;

    // Check if points have any geometry and if 'position' attribute is defined
    if (!points.geometry || !points.geometry.attributes.position) {
        console.warn("Point cloud has no geometry or positions are not defined.");
        return null; // Return early if no points exist
    }

    // Find all nearby points using raycaster
    const intersects = raycaster.intersectObject(points);

    if (intersects.length === 0) {
        console.log("No points found near the cursor.");
        return null; // No nearby points found
    }

    let closestPointID = null;
    let minAngularDistance = Infinity;
    const rayDirection = raycaster.ray.direction.clone();

    // Step 2: Loop through intersected points and filter based on angular distance and distance to the point
    for (const intersect of intersects) {
        const point = intersect.point; // Get the world-space position of the point
        const pointIndex = intersect.index; // Index in the position array

        // Compute the distance to the point
        const distanceToPoint = camera.position.distanceTo(point);

        // Check if the point is within the cutoff distance
        if (distanceToPoint < R0 * maxRenderDistance) {
            // Compute angular distance between ray and point direction
            const pointDirection = point.clone().sub(camera.position).normalize();
            const angle = rayDirection.angleTo(pointDirection);

            // Check if this point is the closest so far within the cutoff angle
            if (angle < minAngularDistance && angle < cutoffAngle) {
                minAngularDistance = angle;
                closestPointID = pointIndex;
            }
        }
    }

    // Return the ID of the closest point if within cutoff distance
    return closestPointID;
}

// CROSSHAIR CODE

var selectedPositions = new Float32Array(3);
selectedPositions[0] = 0; // x-coordinate
selectedPositions[1] = 0; // y-coordinate
selectedPositions[2] = 0; // z-coordinate
var selectedGeometry = new THREE.BufferGeometry();
selectedGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(selectedPositions, 3)
);

// Create a TextureLoader
const textureLoader = new THREE.TextureLoader();

// Load the transparent PNG texture
const pointTexture = textureLoader.load('assets/crosshair.png'); // Replace with your texture path

// Create a PointsMaterial using the loaded texture
const selectedMaterial = new THREE.PointsMaterial({
    map: pointTexture,       // Use the loaded texture
    size: 5,                // Size of the points
    transparent: true,      // Enable transparency
    alphaTest: 0.1          // Optional: Adjust alphaTest for better blending
});

var selectedPoints = new THREE.Points(selectedGeometry, selectedMaterial);
scene.add(selectedPoints)

// get all stars in view
// for each star, check if it is within maxRenderDistance
// from these filtered stars, check which one has the closest angular distance to the cursor
function selectPoints(multiSelect) {
    // get all stars in view
    // find star with lowest angular distance from mouse vector
    // if angular distance less than a certain cutoff, return it

    if (multiSelect){
        var closestPt = getNearestStar();
        if (closestPt !== null) {
            console.log('Intersected point ID:', closestPt);
            console.log('Intersected point coordinates:', positions[3 * closestPt], positions[3 * closestPt + 1], positions[3 * closestPt + 2]);
            console.log('GaiaID: ', GaiaIDs[closestPt]);
            const closestDist = Math.sqrt(positions[3 * closestPt] ** 2 + positions[3 * closestPt + 1] ** 2 + positions[3 * closestPt + 2] ** 2);
            
            const newPoint = new Float32Array(3);
            newPoint[0] = 100 * positions[3 * closestPt] / closestDist;
            newPoint[1] = 100 * positions[3 * closestPt + 1] / closestDist;
            newPoint[2] = 100 * positions[3 * closestPt + 2] / closestDist;
            
            const currentCount = selectedGeometry.attributes.position.count;
            const newSelectedPositions = new Float32Array((currentCount+1)*3);
            newSelectedPositions.set(selectedPositions);
            newSelectedPositions.set(newPoint, currentCount*3);

            selectedPositions = newSelectedPositions;

            selectedGeometry.setAttribute('position', new THREE.BufferAttribute(selectedPositions, 3));
            selectedGeometry.computeBoundingSphere();

            // add the selected stars to the list
            multiSelectedStars.push(GaiaIDs[closestPt]);
            
        } else {
            console.log("No visible points found");
        }
    }
    else{
        var closestPt = getNearestStar();
        if (closestPt !== null) {
            clearSelectedPoints();

            console.log('Intersected point ID:', closestPt);
            console.log('Intersected point coordinates:', positions[3 * closestPt], positions[3 * closestPt + 1], positions[3 * closestPt + 2]);
            console.log('GaiaID: ', GaiaIDs[closestPt]);
            const closestDist = Math.sqrt(positions[3 * closestPt] ** 2 + positions[3 * closestPt + 1] ** 2 + positions[3 * closestPt + 2] ** 2);
            
            const selectedPositionAttribute = selectedGeometry.attributes.position;

            const newPoint = new Float32Array(3);
            newPoint[0] = 100 * positions[3 * closestPt] / closestDist;
            newPoint[1] = 100 * positions[3 * closestPt + 1] / closestDist;
            newPoint[2] = 100 * positions[3 * closestPt + 2] / closestDist;
            
            const currentCount = selectedGeometry.attributes.position.count;
            const newSelectedPositions = new Float32Array((currentCount+1)*3);
            newSelectedPositions.set(selectedPositions);
            newSelectedPositions.set(newPoint, currentCount*3);

            selectedPositions = newSelectedPositions;

            selectedGeometry.setAttribute('position', new THREE.BufferAttribute(selectedPositions, 3));
            selectedGeometry.computeBoundingSphere();

            multiSelectedStars.push(GaiaIDs[closestPt]);

        } else {
            console.log("No visible points found");
        }
    }
}

function onMouseWheel(event) {
    // Check if the event target or its parent has the class 'left-pane'
    if (!event.target.closest('.left-pane')) {
        // Adjust FOV
        camera.fov += event.deltaY * ZOOM_SPEED;
        camera.fov = Math.max(Math.min(camera.fov, 80), 1);
        camera.updateProjectionMatrix();
    }
}




function onMouseDown(event) {
    isDragging = true;
    prevMouseX = event.clientX;
    prevMouseY = event.clientY;
}

function onMouseMove(event) {
    if (!isDragging) return;

    const deltaX = event.clientX - prevMouseX;
    const deltaY = event.clientY - prevMouseY;
    const rotationSpeed = BASE_ROTATION_SPEED * (camera.fov / 75);

    rotation.y -= deltaX * rotationSpeed * -1;
    rotation.x -= deltaY * rotationSpeed * -1;
    rotation.x = Math.max(Math.min(rotation.x, Math.PI / 2), -Math.PI / 2);

    quaternion.setFromEuler(rotation);
    camera.quaternion.copy(quaternion);

    prevMouseX = event.clientX;
    prevMouseY = event.clientY;
}

function onMouseUp() {
    isDragging = false;
}

    
// Get the modal element
var modal = document.getElementById("popupModal");

// Get the <span> element that closes the modal
var closeBtn = modal.getElementsByClassName("close")[0];

// When the page loads, display the modal
window.onload = function() {
  modal.style.display = "block";
}

// When the user clicks on <span> (x), close the modal
closeBtn.onclick = function() {
    console.log("TEST");
  modal.style.display = "none";
}

// Optional: Close the modal if the user clicks outside of it
window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = "none";
  }
}


var starInfoModal = document.getElementById("starInfoModal");
var closeStarModal = starInfoModal.getElementsByClassName("close")[0];

// Event listener for closing the modal
closeStarModal.onclick = function() {
    starInfoModal.style.display = "none";
}

function onMouseClick(event) {
    // Use the renderer's canvas to get the bounding rectangle
    const rect = renderer.domElement.getBoundingClientRect();

    // Update mouse coordinates relative to the canvas
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Print the updated mouse coordinates
    console.log(`Mouse Updated: (${mouse.x}, ${mouse.y})`);

    if (event.shiftKey) {
        selectPoints(false);
        // get most recently clicked star
        if (multiSelectedStars.length > 0 && event.target !== closeStarModal){
            const recent_star = multiSelectedStars[multiSelectedStars.length-1];
            const idx = GaiaIDs.indexOf(recent_star);
            console.log(recent_star)

            var starid = recent_star.split(' ')[2];
            //console.log(`https://api.exosky.org/star_data/${starid}`);
            //fetch(`http://0.0.0.0:8080/star_data/${starid}`) 
            
            fetch(`https://api.exosky.org/star_data/${starid}`)
               .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(data => {
                    console.log(data)
                    // Display the modal
                    // Update the content of the modal
                    const commonName = data['Primary Name']
                    const mag = data['Magnitude'];
                    const d = data['Distance (pc)'];
                    const stype = data['Stellar Type'];
                    const temp = data['Temperature (K)'];

                    document.getElementById('commonStarName').innerHTML = `<span class="highlight">${commonName}</span>`;
                    document.getElementById('starName').textContent = 'Gaia Name: ' +  recent_star;
                    document.getElementById('starMagnitude').textContent = 'Relative Magnitude: ' + mag;
                    document.getElementById('starDistance').textContent = 'Distance from Earth: ' + d + ' pc';
                    document.getElementById('starTemp').textContent = 'Temperature: ' + temp + ' K';
                    document.getElementById('starType').textContent = 'Stellar Classification: ' + stype;
                })
                .catch(error => {
                    console.error('There was a problem with the fetch operation:', error);
                });
            starInfoModal.style.display = "block";
            console.log(recent_star);
        }
    }

    // multiselect for multiple stars to draw a constellation
    if (event.ctrlKey) {
        selectPoints(true);
        // get most recently clicked star
                // get most recently clicked star
        if (multiSelectedStars.length > 0 && event.target !== closeStarModal){
            const recent_star = multiSelectedStars[multiSelectedStars.length-1];
            const idx = GaiaIDs.indexOf(recent_star);
            console.log(recent_star)

            var starid = recent_star.split(' ')[2];
            //console.log(`https://api.exosky.org/star_data/${starid}`);
            //fetch(`http://0.0.0.0:8080/star_data/${starid}`) 
            
            fetch(`https://api.exosky.org/star_data/${starid}`)
               .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(data => {
                    console.log(data)
                    // Display the modal
                    // Update the content of the modal
                    const commonName = data['Primary Name']
                    const mag = data['Magnitude'];
                    const d = data['Distance (pc)'];
                    const stype = data['Stellar Type'];
                    const temp = data['Temperature (K)'];

                    document.getElementById('commonStarName').innerHTML = `<span class="highlight">${commonName}</span>`;
                    document.getElementById('starName').textContent = 'Gaia Name: ' +  recent_star;
                    document.getElementById('starMagnitude').textContent = 'Relative Magnitude: ' + mag;
                    document.getElementById('starDistance').textContent = 'Distance from Earth: ' + d + ' pc';
                    document.getElementById('starTemp').textContent = 'Temperature: ' + temp + ' K';
                    document.getElementById('starType').textContent = 'Stellar Classification: ' + stype;
                })
                .catch(error => {
                    console.error('There was a problem with the fetch operation:', error);
                });
            starInfoModal.style.display = "block";
            console.log(recent_star);
        }
    }

    
}


// Resize event handler
function onWindowResize() {
    // Update the camera aspect ratio
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    // Update the renderer size
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Event listeners
document.addEventListener('click', handleClickOutside);
window.addEventListener('click', onMouseClick);
document.getElementById('fetch-button');
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mouseup', onMouseUp);
document.addEventListener('wheel', onMouseWheel);
window.addEventListener('resize', onWindowResize);

// Add an event listener for the 'keydown' event
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') { // Check if the pressed key is Escape
        clearSelectedPoints(); // Call a function to clear selected points
    }
});

// Function to clear selected points
function clearSelectedPoints() {
    // Reset selectedPositions to an empty array or initial state
    selectedPositions = new Float32Array(0); // Clear selected positions

    // Update the geometry with the new positions
    selectedGeometry.setAttribute('position', new THREE.BufferAttribute(selectedPositions, 3));
    selectedGeometry.computeBoundingSphere(); // Ensure the geometry bounding sphere is updated
    multiSelectedStars = [];
    console.log("Cleared selected points");
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Update max render distance based on camera FOV
    updateSphereSize();

    composer.render();
}
animate();
