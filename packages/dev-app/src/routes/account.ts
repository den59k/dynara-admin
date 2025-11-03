import { marci } from "@den59k/marci";
import { useAuth } from "../hooks/useAuth";

export default marci().use(useAuth).routes((app) => {

  app.get("/", async (req) => {

    

  })

})