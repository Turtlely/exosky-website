import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Constants
const MAG_CUTOFF = 8.5;
const R0 = 100;
const r_fact = 0.15;
const BASE_ROTATION_SPEED = 0.001;
const ZOOM_SPEED = 0.01;
const MOVE_SPEED = 0.1;

// Variables
let EXOPLANET_ID = "Kepler-1032 b";
let jobId = null; // Declare the jobId variable outside
let jobCompleted = false;
const interval = 200;
let positions = [];
let GaiaIDs = [];
let numericIDs = [];
let colors = [];
let highestID = 0;

// Mouse interaction variables
let isDragging = false;
let prevMouseX = 0;
let prevMouseY = 0;
const baseRotationSpeed = 0.001;

const quaternion = new THREE.Quaternion();
const rotation = new THREE.Euler(0, 3/2 * Math.PI, 0, 'YXZ');

// Call initialize when the page loads
initialize();

document.addEventListener('DOMContentLoaded', () => {
    const exoplanetInput = document.getElementById('dropdown-menu');
    const fetchButton = document.getElementById('fetch-button');

    fetchButton.addEventListener('click', async () => {
        try {
            // Grab the position of the exoplanet
            const inputValue = searchInput.value.trim();
            const exoplanetPosition = await handleExoplanetInput(inputValue);

            // Ensure position is not null
            if (exoplanetPosition == null) return;

            // Send the job request, and save the returned job ID
            jobId = await submitJob(MAG_CUTOFF, exoplanetPosition);

            // Ensure job ID is not null
            if (jobId == null) return;

            jobCompleted = false;
            
            console.log('Job ID:', jobId);
            
            // Poll for job completion using setTimeout for async handling
            async function pollJobStatus() {
                try {
                    if (!jobCompleted) {
                        //console.log("ping!");

                        const data = await fetchAndProcessData(jobId);

                        // Plot the star(s) in the sky
                        //console.log("Star data: ", data[0]);
                        addStarBatch(data[0]);

                        // Re-call pollJobStatus after a delay if job is not completed
                        setTimeout(pollJobStatus, interval);
                    } else {
                        console.log("done!");
                    }
                } catch (error) {
                    console.error('Error while fetching data:', error);
                }
            }

            // Start polling for job completion
            pollJobStatus();
            
        } catch (error) {
            console.error('An error occurred:', error);
        }
    });
});

// Scene setup
const scene = new THREE.Scene();

// Set the background color to black
scene.background = new THREE.Color(0x0C0C0D); // black

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
    0.1,
    0.0,
    0.1
);
composer.addPass(bloomPass);

const radius = 100; // Radius of the sphere
const segments = 16; // Number of meridians and parallels

// Material for the grid lines
const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xcccccc,  // Light gray color
    transparent: true,
    opacity: 0.05      // Set the transparency level (0.0 fully transparent, 1.0 fully opaque)
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
createMeridianLines(radius, segments);
createParallelLines(radius, segments);

// Create star points
const starSprite = new THREE.TextureLoader().load('assets/disc.png');
starSprite.colorSpace = THREE.SRGBColorSpace;
const pointsMaterial = new THREE.PointsMaterial({
    vertexColors: true,
    sizeAttenuation: true,
    map: starSprite,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    size: 1
});
const pointsGeometry = new THREE.BufferGeometry();
const points = new THREE.Points(pointsGeometry, pointsMaterial);
scene.add(points);

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
        const x = star.x;
        const y = star.y;
        const z = star.z;
        const dist = Math.sqrt(x**2 + y**2 + z**2);
        const mult = R0 * Math.exp(r_fact * magnitude);
        const dfact = magnitude > 0 ? Math.exp(-0.1 * magnitude) : 1;
        const newID = ++highestID;

        // Star position (x, y, z)
        newPositions.push((x / dist) * mult, (y / dist) * mult, (z / dist) * mult);
        // Star color (r, g, b)
        newColors.push(star.r * dfact, star.g * dfact, star.b * dfact);
        //console.log(star.r,star.g,star.b);
        //newColors.push(star.r, star.g, star.b);

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

async function submitJob(magCutoff, exo_coords) {
    try {
        const response = await fetch('http://api.exosky.org/create_job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                limiting_magnitude: magCutoff,
                coordinates: exo_coords
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
    const url = `http://api.exosky.org/get_job/${jobId}`;

    try {
        const response = await fetch(url);
        
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


function onMouseWheel(event) {
    camera.fov += event.deltaY * ZOOM_SPEED;
    camera.fov = Math.max(Math.min(camera.fov, 80), 1);
    camera.updateProjectionMatrix();
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
var closeBtn = document.getElementsByClassName("close")[0];

// When the page loads, display the modal
window.onload = function() {
  modal.style.display = "block";
}


// When the user clicks on <span> (x), close the modal
closeBtn.onclick = function() {
  modal.style.display = "none";
}

// Optional: Close the modal if the user clicks outside of it
window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = "none";
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
document.getElementById('fetch-button');
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mouseup', onMouseUp);
document.addEventListener('wheel', onMouseWheel);
window.addEventListener('resize', onWindowResize);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
animate();
