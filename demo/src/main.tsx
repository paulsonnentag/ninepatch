import { render } from "solid-js/web";
import { Page } from "./page";
import "./styles.css";

const app = document.getElementById("app")!;
app.replaceChildren();
render(() => <Page />, app);
