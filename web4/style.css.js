export default /*css*/
`
* {
    font-family: monospace;
    color: #1f1;
}
#content {
    max-width: 1024px;
    margin: auto;
}
.codeblock {
    padding: 4px;
    border-radius: 5px;
    background-color: #333;
    color: white;
    font-family: monospace;
}
.errorstatus {
    background-color: red;
    color: white;
    padding: 4px;
    border-radius: 5px;
}
textarea {
    width: 100%;
    min-height: 100px; 
}
input, textarea {
    border-color: #1f1;
    background-color: #333;
    padding: 10px;
}

input:focus, textarea:focus {
    border-color: #afa;
}

button {
    background-color: #1f1;
    border-radius: 3px;
    color: #333;
    padding: 10px;
    border: none;
    cursor: pointer;
}
button:hover {
    background-color: #afa;
}
`;