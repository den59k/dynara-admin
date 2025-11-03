import { marci } from "@den59k/marci";
import { ravendb } from "../plugins/ravendb";

export default marci().routes((app) => {

  app.get("/users", req => {
    
    const session = ravendb.openSession()

    const users = session.query({ collection: "Users" }).all()
    
    session.store()

    return users
  })

})