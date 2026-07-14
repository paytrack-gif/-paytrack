// ======================================================
// MUNICIPALITY MANAGEMENT SYSTEM
// companies.js
// Part 1
// ======================================================



// ======================================================
// DEFAULT PAYMENT SCHEDULES
// ======================================================

const defaultSchedules = {

    Nettoyage: [
        "01/03",
        "04/06",
        "07/09",
        "10/12"
    ],

    "Sécurité": [
        "Jan-Mar",
        "Apr-Jun",
        "Jul-Sep",
        "Oct-Dec"
    ],

    Gardiennage: [
         "01/03",
        "04/06",
        "07/09",
        "10/12"
    ],

    Restauration: [
        "01/03",
        "04/06",
        "09/11",
        "12"
    ],

    "Dar Etalib": [
       "01/03",
        "04/06",
        "09/11",
        "12"
    ]

};



// ======================================================
// ELEMENTS
// ======================================================

const category = document.getElementById("category");

const preview = document.getElementById("defaultSchedulePreview");

const defaultRadio = document.querySelector(
    'input[name="scheduleType"][value="default"]'
);

const customRadio = document.querySelector(
    'input[name="scheduleType"][value="custom"]'
);

const customSchedule = document.getElementById("customSchedule");



// ======================================================
// UPDATE DEFAULT SCHEDULE PREVIEW
// ======================================================

function updateSchedulePreview() {

    preview.innerHTML = "";

    const currentCategory = category.value;

    const schedule = defaultSchedules[currentCategory] || [];

    schedule.forEach(period => {

        const badge = document.createElement("span");

        badge.className = "schedule-badge";

        badge.textContent = period;

        preview.appendChild(badge);

    });

}



// ======================================================
// SHOW / HIDE CUSTOM SCHEDULE
// ======================================================

function toggleSchedule() {

    if (defaultRadio.checked) {

        customSchedule.style.display = "none";

        preview.parentElement.style.display = "block";

    }

    else {

        customSchedule.style.display = "block";

        preview.parentElement.style.display = "none";

    }

}



// ======================================================
// INITIAL EVENTS
// ======================================================

category.addEventListener("change", updateSchedulePreview);

defaultRadio.addEventListener("change", toggleSchedule);

customRadio.addEventListener("change", toggleSchedule);



// ======================================================
// INITIAL LOAD
// ======================================================

updateSchedulePreview();

toggleSchedule();// ======================================================
// PART 2
// CUSTOM CATEGORY DROPDOWN
// ======================================================

const selectBox = document.getElementById("selectBox");
const selectMenu = document.getElementById("selectMenu");
const selectedCategory = document.getElementById("selectedCategory");


// Open / Close dropdown

selectBox.addEventListener("click", function (e) {

    e.stopPropagation();

    selectMenu.classList.toggle("show");

});


// Close when clicking outside

document.addEventListener("click", function () {

    selectMenu.classList.remove("show");

});


// Prevent closing when clicking inside menu

selectMenu.addEventListener("click", function (e) {

    e.stopPropagation();

});


// =======================================
// CATEGORY CLICK
// =======================================

function attachCategoryEvents() {

    const options = document.querySelectorAll(".option");

    options.forEach(option => {

        option.onclick = function () {

            const value = this.textContent.trim();

            selectedCategory.textContent = value;

            category.value = value;

            updateSchedulePreview();

            selectMenu.classList.remove("show");

        };

    });

}

attachCategoryEvents();


// ======================================================
// CATEGORY MODAL
// ======================================================

const addCategoryBtn = document.getElementById("addCategoryBtn");

const modal = document.getElementById("categoryModal");

const closeModal = document.getElementById("closeModal");

const saveCategory = document.getElementById("saveCategory");

const newCategoryName = document.getElementById("newCategoryName");

addCategoryBtn.addEventListener("click", function () {

    modal.classList.add("show");

    selectMenu.classList.remove("show");

});

closeModal.addEventListener("click", function () {

    modal.classList.remove("show");

});


// Close modal when clicking outside it

window.addEventListener("click", function (e) {

    if (e.target === modal) {

        modal.classList.remove("show");

    }

});// ======================================================
// PART 3
// ADD NEW CATEGORY
// ======================================================

const addPeriod = document.getElementById("addPeriod");
const periodContainer = document.getElementById("periodContainer");

let periodCount = 4;


// ----------------------------------------
// Add another payment period
// ----------------------------------------

addPeriod.addEventListener("click", function () {

    periodCount++;

    const div = document.createElement("div");

    div.className = "form-group";

    div.innerHTML = `
        <label>Période ${periodCount}</label>

        <input
            type="text"
            class="newPeriod"
            placeholder="Exemple : Jan-Mar">
    `;

    periodContainer.appendChild(div);

});


// ----------------------------------------
// Save Category
// ----------------------------------------

saveCategory.addEventListener("click", function () {

    const name = newCategoryName.value.trim();

    if (name === "") {

        alert("Veuillez saisir un nom de service.");

        return;

    }

    if (defaultSchedules[name]) {

        alert("Ce service existe déjà.");

        return;

    }


    // Get periods

    const periods = [];

    document.querySelectorAll(".newPeriod").forEach(input => {

        if (input.value.trim() !== "") {

            periods.push(input.value.trim());

        }

    });


    if (periods.length === 0) {

        alert("Veuillez saisir au moins une période de paiement.");

        return;

    }


    // Save schedule

    defaultSchedules[name] = periods;


    // Create dropdown option

    const option = document.createElement("div");

    option.className = "option";

    option.textContent = name;


    // Insert before "Add New Category"

    selectMenu.insertBefore(option, addCategoryBtn);


    // Reattach click events

    attachCategoryEvents();


    // Select new category

    selectedCategory.textContent = name;

    category.value = name;

    updateSchedulePreview();


    // Reset popup

    modal.classList.remove("show");

    newCategoryName.value = "";

    document.querySelectorAll(".newPeriod").forEach(input => {

        input.value = "";

    });

    // Remove extra periods

    while (periodContainer.children.length > 4) {

        periodContainer.removeChild(periodContainer.lastChild);

    }

    periodCount = 4;

});// ======================================================
// PART 4
// COMPANY REGISTRATION
// ======================================================

const companyForm = document.getElementById("companyForm");
const tableBody = document.getElementById("companiesTableBody");

let companies = JSON.parse(localStorage.getItem("companies")) || [];
let editingIndex = -1;

// ===============================
// Save Companies
// ===============================

function saveCompanies() {

    localStorage.setItem(
        "companies",
        JSON.stringify(companies)
    );

}


// ===============================
// Display Companies
// ===============================

function displayCompanies() {

    tableBody.innerHTML = "";

    if (companies.length === 0) {

        tableBody.innerHTML = `

        <tr>

            <td colspan="9" style="text-align:center;padding:30px;">

                Aucune entreprise enregistrée pour le moment.

            </td>

        </tr>

        `;

        return;

    }

    companies.forEach((company,index)=>{

        const row=document.createElement("tr");

        row.innerHTML=`

        <td>${index+1}</td>

        <td>${company.number}</td>

        <td>${company.name}</td>

        <td>${company.category}</td>

        <td>${company.startYear}</td>

        <td>${company.scheduleType}</td>

       <td title="${company.object}">${company.object}</td>

<td title="${company.comment}">${company.comment}</td>

     <td class="action-buttons">

    <button
        class="btn btn-warning edit-btn"
        data-index="${index}">
        Modifier
    </button>

    <button
        class="btn btn-danger delete-btn"
        data-index="${index}">
        Supprimer
    </button>

</td>
        `;

        tableBody.appendChild(row);

    });

    attachDeleteEvents();
    attachEditEvents();
}


// ===============================
// Reset the custom period fields back to the default 4
// ===============================

function resetCustomPeriodFields() {

    customPeriodContainer.innerHTML = `
        <div class="form-group">
            <label>Periode 1</label>
            <input type="text" id="period1" class="customPeriod" placeholder="Example : Jan-Feb">
        </div>
        <div class="form-group">
            <label>Periode 2</label>
            <input type="text" id="period2" class="customPeriod" placeholder="Example : Mar-Jun">
        </div>
        <div class="form-group">
            <label>Periode 3</label>
            <input type="text" id="period3" class="customPeriod" placeholder="Example : Jul-Oct">
        </div>
        <div class="form-group">
            <label>Periode 4</label>
            <input type="text" id="period4" class="customPeriod" placeholder="Example : Nov-Dec">
        </div>
    `;

    customPeriodNumber = 4;

}


// ===============================
// Make sure there are at least `count` custom period fields
// (used when editing a company that has more periods than
// the form currently shows)
// ===============================

function ensureCustomPeriodFields(count) {

    while (customPeriodContainer.querySelectorAll("input").length < count) {

        customPeriodNumber++;

        const div = document.createElement("div");

        div.className = "form-group";

        div.innerHTML = `
            <label>Période ${customPeriodNumber}</label>
            <input type="text" class="customPeriod" placeholder="Exemple : Jan-Mar">
        `;

        customPeriodContainer.appendChild(div);

    }

}


// ===============================
// Register Company
// ===============================

companyForm.addEventListener("submit",function(e){

    e.preventDefault();

    let schedule=[];

    if(defaultRadio.checked){

        schedule=[...defaultSchedules[category.value]];

    }

    else{

        document.querySelectorAll("#customSchedule input").forEach(input=>{

            if(input.value.trim()!=""){

                schedule.push(input.value.trim());

            }

        });

    }

    if (schedule.length === 0) {

        alert("Veuillez fournir au moins une période de paiement.");

        return;

    }

    const company={

        number:document.getElementById("companyNumber").value,

        name:document.getElementById("companyName").value,

        category:category.value,

        startYear:document.getElementById("startYear").value,

        scheduleType:defaultRadio.checked?"Default":"Custom",

        schedule:schedule,

        object:document.getElementById("companyObject").value,

        comment:document.getElementById("companyComment").value

    };

    if (editingIndex === -1) {

        companies.push(company);

    } else {

        companies[editingIndex] = company;

        editingIndex = -1;

    }

    saveCompanies();

    displayCompanies();

    companyForm.reset();

    category.value="Nettoyage";

    selectedCategory.textContent="Nettoyage";

    updateSchedulePreview();

    defaultRadio.checked = true;

    toggleSchedule();

    resetCustomPeriodFields();

});// ======================================================
// DELETE COMPANY
// ======================================================

function attachDeleteEvents(){

    document.querySelectorAll(".delete-btn").forEach(btn=>{

        btn.addEventListener("click",function(){

            const index=this.dataset.index;

            if(confirm("Supprimer cette entreprise ?")){

                companies.splice(index,1);

                if (editingIndex == index) editingIndex = -1;

                saveCompanies();

                displayCompanies();

            }

        });

    });

}

function attachEditEvents() {

    document.querySelectorAll(".edit-btn").forEach(btn => {

        btn.addEventListener("click", function () {

            editingIndex = Number(this.dataset.index);

            const company = companies[editingIndex];

            document.getElementById("companyNumber").value = company.number;
            document.getElementById("companyName").value = company.name;
            document.getElementById("startYear").value = company.startYear;
            document.getElementById("companyObject").value = company.object;
            document.getElementById("companyComment").value = company.comment;

            category.value = company.category;
            selectedCategory.textContent = company.category;

            updateSchedulePreview();

            if(company.scheduleType === "Default"){

                defaultRadio.checked = true;

                toggleSchedule();

            }else{

                customRadio.checked = true;

                toggleSchedule();

                resetCustomPeriodFields();

                ensureCustomPeriodFields(company.schedule.length);

                document.querySelectorAll("#customSchedule input").forEach((input,index)=>{

                    input.value = company.schedule[index] || "";

                });

            }

            window.scrollTo({

                top:0,

                behavior:"smooth"

            });

        });

    });

}
// ======================================================
// INITIALIZE
// ======================================================

displayCompanies();

const addCustomPeriod = document.getElementById("addCustomPeriod");
const customPeriodContainer = document.getElementById("customPeriodContainer");

let customPeriodNumber = 4;

addCustomPeriod.addEventListener("click", function () {

    customPeriodNumber++;

    const div = document.createElement("div");

    div.className = "form-group";

    div.innerHTML = `
        <label>Période ${customPeriodNumber}</label>

        <input
            type="text"
            class="customPeriod"
            placeholder="Exemple : Jan-Mar">
    `;

    customPeriodContainer.appendChild(div);

});
